import { ReactNode, useContext, useRef, useState } from "react";
import { ProfileType } from "../types/Profile";
import { GlobalContext } from "../context/Global";
import { URIType } from "../types/URI";

type Props = {
    profile: ProfileType | undefined;
    showDialog: (title: string, content: string | ReactNode) => void;
    updateUris: (profile_id: number) => Promise<void>;
}
export function AddConfig({ profile, showDialog, updateUris }: Props) {
    const modalRef = useRef<HTMLDialogElement>(null);
    const titleRef = useRef<HTMLInputElement>(null);
    const uriRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);

    const context = useContext(GlobalContext);
    const db = context?.db;


    const addNewConfigHandler = async () => {

        setLoading(true);

        if (uriRef?.current?.value === '') {
            showDialog('Error', 'URI is required');
            setLoading(false);
            return;
        }

        const check = (await db?.select<URIType[]>("select * from urls where profile_id = ? and uri = ? ", [profile?.id, uriRef?.current?.value]))?.[0];
        if (!check?.id) {
            await db?.execute("insert into urls(profile_id, name, uri) values(?, ?, ?)", [profile?.id, titleRef?.current?.value, uriRef?.current?.value]);
        }

        showDialog('New Config', 'New config added successfully');
        setLoading(false);
        updateUris(profile?.id || 0);
    }

    return <>
        <dialog ref={modalRef} className="modal">
            <div className="modal-box">
                <h3 className="text-lg font-bold">New Config for {profile?.name}</h3>
                <p className="py-4">
                    <input
                        placeholder="Title"
                        type="text"
                        className="input p-2 w-full mb-4"
                        ref={titleRef}
                    />

                    <input
                        placeholder="URI"
                        type="text"
                        className="input p-2 w-full mb-4"
                        ref={uriRef}
                    />
                    <button disabled={loading} className="btn px-4 py-2 mr-2" onClick={addNewConfigHandler}>
                        {loading ? 'Loading ...' : 'Add New Config'} {loading && <span className="loading loading-ring loading-md"></span>}
                    </button>

                </p>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
        <div className="my-2 flex gap-2 items-center flex-wrap">
            <button className="btn" onClick={() => {
                modalRef?.current?.showModal();
            }}>Add New Config to {profile?.name}</button>
        </div>
    </>
}