import { Card } from "./ui/Card";
import { ReactNode, useContext, useRef, useState } from "react";
import { GlobalContext } from "../context/Global";
import { ProfileType } from "../types/Profile";
import { URIType } from "../types/URI";
import { LastInsertType } from "../types/LastInsert";
import { extractGroupUrls } from "../utils";
import { Button } from "./ui/Button";

type Props = {
    setUris: React.Dispatch<React.SetStateAction<Array<URIType>>>;
    updateProfiles: () => void,
    showDialog: (title: string, content: string | ReactNode) => void,
    isDark: boolean,
}
export function Profile({
    setUris,
    updateProfiles,
    showDialog,
    isDark,
}: Props) {

    const [loading, setLoading] = useState(false);
    const [count, setCount] = useState(0);
    const [all, setAll] = useState(0);

    const context = useContext(GlobalContext);
    const db = context?.db;

    const addNewProfile = async () => {
        setCount(0);
        setAll(0);
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
            // if (profile?.id) {
            //     showDialog('Error', 'Profile with this name exists');
            //     setLoading(false);
            //     return;
            // }
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
                setAll(urls?.length);
                for (const value of urls) {
                    const result = await db?.select<Array<URIType>>("select id from urls where profile_id = ? and uri = ?", [profile_id, value?.url])
                    const url = result?.[0];
                    if (!url?.id) {
                        await db?.execute("insert into urls(profile_id, name, uri) values(?, ?, ?)", [profile_id, value?.name, value?.url]);
                    }
                    setCount((prev) => prev + 1);
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
        <Card isDark={isDark}>
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Create New Profile</h2>
            <p className="mb-4 text-sm text-slate-600">Import a subscription URL and turn it into a ready-to-test profile.</p>
            <input
                placeholder="Title"
                type="text"
                className="mb-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-500"
                ref={titleRef}
            />

            <input
                placeholder="Enter valid URL"
                type="text"
                className="mb-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-500"
                ref={uriRef}
            />
            <Button disabled={loading} variant="primary" className="w-full" onClick={addNewProfile}>
                {loading ? 'Loading ...' : 'Add New Profile'} {loading && <span className="ml-2 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-white"></span>}
                {loading && ` ${count} from ${all}`}
            </Button>

            {loading && <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(count / Math.max(all, 1)) * 100}%` }} /></div>}
        </Card>

    );
}