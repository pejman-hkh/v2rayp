import { ReactNode, RefObject } from "react";

type ModalProps = {
    fref: RefObject<HTMLDialogElement>;
    title: string;
    content: string | ReactNode;
};

export function Modal({ fref, title, content }: ModalProps) {
    return (
        <dialog ref={fref} className="rounded-[2rem] border border-slate-800 bg-slate-950/95 p-0 shadow-2xl shadow-slate-950/40">
            <div className="rounded-[2rem] bg-slate-950/95 p-6 text-slate-100">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-semibold">{title}</h3>
                    </div>
                    <button
                        type="button"
                        className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
                        onClick={() => fref.current?.close()}
                    >
                        Close
                    </button>
                </div>
                <div className="text-sm leading-6 text-slate-300">{content}</div>
            </div>
        </dialog>
    );
}