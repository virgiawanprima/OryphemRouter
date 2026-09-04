"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary: "bg-[color:var(--md-sys-color-primary)] text-[color:var(--md-sys-color-onPrimary)] hover:bg-[color:var(--md-sys-color-primary)] hover:opacity-80 disabled:bg-[color:var(--md-sys-color-onSurface)]/12 disabled:text-[color:var(--md-sys-color-onSurface)]/38",
  secondary: "bg-[color:var(--md-sys-color-secondaryContainer)] text-[color:var(--md-sys-color-onSecondaryContainer)] hover:opacity-80 disabled:bg-[color:var(--md-sys-color-onSurface)]/12 disabled:text-[color:var(--md-sys-color-onSurface)]/38",
  ghost: "text-[color:var(--md-sys-color-primary)] hover:bg-[color:var(--md-sys-color-primary)]/10 disabled:text-[color:var(--md-sys-color-onSurface)]/38",
  danger: "bg-[color:var(--md-sys-color-errorContainer)] text-[color:var(--md-sys-color-onErrorContainer)] hover:opacity-80 disabled:bg-[color:var(--md-sys-color-onSurface)]/12 disabled:text-[color:var(--md-sys-color-onSurface)]/38",
  success: "bg-[color:var(--md-sys-color-primary)] text-[color:var(--md-sys-color-onPrimary)] hover:opacity-80 disabled:bg-[color:var(--md-sys-color-onSurface)]/12 disabled:text-[color:var(--md-sys-color-onSurface)]/38",
  outline: "border border-[color:var(--md-sys-color-outline)] text-[color:var(--md-sys-color-primary)] bg-transparent hover:bg-[color:var(--md-sys-color-primary)]/10 disabled:border-[color:var(--md-sys-color-onSurface)]/12 disabled:text-[color:var(--md-sys-color-onSurface)]/38",
};

const sizes = {
  sm: "h-7 px-3 text-[13px] rounded-[var(--md-sys-shape-corner-full)]",
  md: "h-9 px-4 text-[14px] rounded-[var(--md-sys-shape-corner-full)]",
  lg: "h-11 px-6 text-[14px] rounded-[var(--md-sys-shape-corner-full)]",
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--md-sys-color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
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
