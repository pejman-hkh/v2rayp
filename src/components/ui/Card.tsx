import { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
    return (
        <div className="card bg-base-100 shadow-sm card-border my-4">
            <div className="card-body">
                {children}
            </div>
        </div>
    );
}