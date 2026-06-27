import { ReactNode, useContext, useRef, useState } from "react";
import { ProfileType } from "../types/Profile";
import { GlobalContext } from "../context/Global";
import { URIType } from "../types/URI";
import { Button } from "./ui/Button";

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

        <dialog ref={modalRef} className="bg-white mt-10 mx-auto rounded-[2rem] border dark:border-slate-800 dark:bg-slate-950/95 p-0 shadow-2xl shadow-slate-950/40 text-slate-600">

            <div className="w-[min(100vw-2rem,32rem)] rounded-[2rem] dark:bg-slate-950/95 p-6 dark:text-slate-100">
                <button
                    type="button"
                    className="rounded-full border dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm dark:text-slate-300 transition dark:hover:border-slate-600 dark:hover:bg-slate-800 outline-none mb-2"
                    onClick={() => modalRef.current?.close()}
                >
                    X
                </button>
                <h3 className="text-lg font-semibold dark:text-slate-100">New Config for {profile?.name}</h3>
                <div className="mt-4 space-y-4">
                    <input
                        placeholder="Title"
                        type="text"
                        className="w-full rounded-2xl border dark:border-slate-700 dark:bg-slate-900/90 px-4 py-3 dark:text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400"
                        ref={titleRef}
                    />

                    <input
                        placeholder="URI"
                        type="text"
                        className="w-full rounded-2xl border dark:border-slate-700 dark:bg-slate-900/90 px-4 py-3 dark:text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400"
                        ref={uriRef}
                    />
                    <Button disabled={loading} variant="primary" className="w-full" onClick={addNewConfigHandler}>
                        {loading ? 'Loading ...' : 'Add New Config'} {loading && <span className="ml-2 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-white"></span>}
                    </Button>
                </div>
            </div>
        </dialog>
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => {
                modalRef?.current?.showModal();
            }}>Add New Config to {profile?.name}</Button>
        </div>
    </>
}