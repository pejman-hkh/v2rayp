import { RefObject } from "react";

export function Modal({ fref, title, content }: { fref: RefObject<HTMLDialogElement>, title: string, content: string }) {
    return (
        <dialog ref={fref} className="modal">
            <div className="modal-box">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="py-4">{content}</p>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
}