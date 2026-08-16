"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary: "border-2 border-brand-600 text-brand-600 hover:bg-brand-500 hover:text-white disabled:bg-surface-3 disabled:text-text-muted",
  secondary: "border-2 border-border-500 text-text-main hover:bg-surface-2 hover:border-brand-600 disabled:bg-surface-3 disabled:text-text-muted",
  outline: "border-2 border-border-500 text-text-main hover:bg-surface-2 hover:border-brand-600 disabled:bg-surface-3 disabled:text-text-muted",
  ghost: "text-text-main hover:bg-surface-2 hover:border-brand-600 disabled:bg-surface-3 disabled:text-text-muted",
  danger: "border-2 border-red-600 text-red-600 hover:bg-red-500 hover:text-white disabled:bg-surface-3 disabled:text-text-muted",
  success: "border-2 border-green-600 text-green-600 hover:bg-green-500 hover:text-white disabled:bg-surface-3 disabled:text-text-muted",
};

const sizes = {
  sm: "h-7 px-3 text-xs border-2 border-border-500",
  md: "h-9 px-4 text-sm border-2 border-border-500",
  lg: "h-11 px-6 text-sm border-2 border-border-500",
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
