"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary: "bg-c-blue-600 text-white hover:bg-c-blue-800 disabled:bg-surface-3 disabled:text-text-muted",
  secondary: "border border-border text-text-muted bg-transparent hover:border-c-blue-600/40 hover:text-text-main disabled:bg-surface-3 disabled:text-text-muted",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text-main disabled:text-text-muted",
  danger: "border border-c-red-600/40 text-c-red-600 bg-c-red-50/10 hover:bg-c-red-600 hover:text-white disabled:bg-surface-3 disabled:text-text-muted",
  success: "border border-c-teal-600/40 text-c-teal-600 bg-c-teal-50/10 hover:bg-c-teal-600 hover:text-white disabled:bg-surface-3 disabled:text-text-muted",
  outline: "border border-border text-text-main bg-transparent hover:border-c-blue-600/40 hover:text-text-main disabled:bg-surface-3 disabled:text-text-muted",
};

const sizes = {
  sm: "h-7 px-3 text-[13px] rounded-[8px]",
  md: "h-9 px-4 text-[14px] rounded-[8px]",
  lg: "h-11 px-6 text-[14px] rounded-[12px]",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 ease-out cursor-pointer",
        "active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className="material-symbols-outlined text-[18px]">{iconRight}</span>
      )}
    </button>
  );
}
