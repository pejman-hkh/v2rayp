import { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "success" | "danger" | "ghost";
  className?: string;
  children: ReactNode;
};

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-sky-500 text-white hover:bg-sky-400 focus-visible:ring-sky-400 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:ring-slate-500",
  secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:ring-slate-500",
  success: "bg-emerald-500 text-slate-950 hover:bg-emerald-400 focus-visible:ring-emerald-400",
  danger: "bg-rose-500 text-white hover:bg-rose-400 focus-visible:ring-rose-400",
  ghost: "bg-transparent border border-slate-700 text-slate-600 hover:bg-slate-800 focus-visible:ring-slate-500",
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      type={props.type || "button"}
      className={`cursor-pointer inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
