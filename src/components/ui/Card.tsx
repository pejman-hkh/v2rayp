import { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  isDark?: boolean;
};

export function Card({ children, className = "", isDark = false }: CardProps) {
    const themeClass = isDark
        ? "border-slate-800 bg-slate-900/85 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.55)]"
        : "border-slate-200/70 bg-white/80 text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.10)]";

    return (
        <div className={`rounded-[2rem] border p-6 backdrop-blur-xl ${themeClass} ${className}`}>
            {children}
        </div>
    );
}