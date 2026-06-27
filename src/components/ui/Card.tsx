import { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
    return (
        <div className={`rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/85 dark:text-slate-100 dark:shadow-[0_20px_60px_rgba(2,6,23,0.55)] ${className}`}>
            {children}
        </div>
    );
}