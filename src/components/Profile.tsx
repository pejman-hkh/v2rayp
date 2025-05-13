import { Card } from "./ui/Card";
import { useContext, useRef, useState } from "react";
import { GlobalContext } from "../context/Global";
import { ProfileType } from "../types/Profile";
import { URIType } from "../types/URI";
import { LastInsertType } from "../types/LastInsert";
import { extractGroupUrls } from "../utils";

type Props = {
    setUris: React.Dispatch<React.SetStateAction<Array<URIType>>>;
    updateProfiles: () => void,
    showDialog: (title: string, content: string) => void
}
export function Profile({
    setUris,
    updateProfiles,
    showDialog
}: Props) {

    const [loading, setLoading] = useState(false);

    const context = useContext(GlobalContext);
    const db = context?.db;

    const addNewProfile = async () => {
        if (titleRef?.current?.value === '') {
            showDialog('Error', 'Please enter title');
            return;
        }

        setLoading(true);
        if (titleRef?.current?.value) {
            const uri = uriRef?.current?.value;
            const title = titleRef?.current?.value;
            const result = await db?.select<ProfileType[]>("select id from profiles where name = ?", [title]);
            const profile = result?.[0];
            if (profile?.id) {
                showDialog('Error', 'Profile with this name exists');
                setLoading(false);
                return;
            }
            let profile_id = 0;
            if (!profile?.id) {
                await db?.execute("insert into profiles(name, uri) values(?, ?)", [title ?? uri, uri]);
                const result = await db?.select<Array<LastInsertType>>('SELECT last_insert_rowid() as id');
                profile_id = result?.[0].id || 0;
            } else {
                profile_id = profile?.id
            }

            if (uri) {
                const urls = await extractGroupUrls(uri);
                for (const value of urls) {
                    const result = await db?.select<Array<URIType>>("select id from urls where profile_id = ? and uri = ?", [profile_id, value?.url])
                    const url = result?.[0];
                    if (!url?.id) {
                        await db?.execute("insert into urls(profile_id, name, uri) values(?, ?, ?)", [profile_id, value?.name, value?.url]);
                    }
                };

                const uris = await db?.select<React.SetStateAction<URIType[]>>("select * from urls where profile_id = ? order by delay desc", [profile_id]);
                if (uris) {
                    setUris(uris);
                }
            }
            updateProfiles();
        }
        setLoading(false);
        showDialog('Success', 'Create new profile done');
        titleRef.current!.value = '';
        uriRef.current!.value = '';
    };

    const titleRef = useRef<HTMLInputElement>(null);
    const uriRef = useRef<HTMLInputElement>(null);
    return (
        <Card>
            <h1 className="text-2xl font-bold mb-4">V2Ray New Profile</h1>
            <input
                placeholder="Title"
                type="text"
                className="input p-2 w-full mb-4"
                ref={titleRef}
            />

            <input
                placeholder="Enter valid URL"
                type="text"
                className="input p-2 w-full mb-4"
                ref={uriRef}
            />
            <button disabled={loading} className="btn px-4 py-2 mr-2" onClick={addNewProfile}>
                {loading ? 'Loading ...' : 'Add New Profile'} {loading && <span className="loading loading-ring loading-md"></span>}
            </button>
        </Card>

    );
}