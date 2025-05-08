import { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
    return (
        <div className="full-w mb-4 p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            {children}
        </div>

    );
}