import { ReactNode, RefObject } from "react";

type ModalProps = {
    fref: RefObject<HTMLDialogElement>;
    title: string;
    content: string | ReactNode;
};

export function Modal({ fref, title, content }: ModalProps) {
    return (
        <dialog ref={fref} className="bg-white text-slate-900 mt-10 mx-auto rounded-[2rem] border dark:border-slate-800 dark:bg-slate-950/95 p-0 shadow-2xl shadow-slate-950/40">
            <div className="rounded-[2rem] dark:bg-slate-950/95 p-6 dark:text-slate-100">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-semibold">{title}</h3>
                    </div>
                    <button
                        type="button"
                        className="cursor-pointer border-0 rounded-full dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm dark:text-slate-300 transition dark:hover:border-slate-600 dark:hover:bg-slate-800 outline-none "
                        onClick={() => fref.current?.close()}
                    >
                        X
                    </button>
                </div>
                <div className="text-sm leading-6 dark:text-slate-300">{content}</div>
            </div>
        </dialog>
    );
}