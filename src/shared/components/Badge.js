"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  default: "border border-[color:var(--md-sys-color-outlineVariant)] text-[color:var(--md-sys-color-onSurfaceVariant)]",
  teal: "bg-[color:var(--md-sys-color-secondaryContainer)] text-[color:var(--md-sys-color-onSecondaryContainer)] border border-transparent",
  blue: "bg-[color:var(--md-sys-color-secondaryContainer)] text-[color:var(--md-sys-color-onSecondaryContainer)] border border-transparent",
  amber: "bg-[color:var(--md-sys-color-tertiaryContainer)] text-[color:var(--md-sys-color-onTertiaryContainer)] border border-transparent",
  red: "bg-[color:var(--md-sys-color-errorContainer)] text-[color:var(--md-sys-color-onErrorContainer)] border border-transparent",
  primary: "bg-[color:var(--md-sys-color-secondaryContainer)] text-[color:var(--md-sys-color-onSecondaryContainer)] border border-transparent",
  success: "bg-[color:var(--md-sys-color-secondaryContainer)] text-[color:var(--md-sys-color-onSecondaryContainer)] border border-transparent",
  warning: "bg-[color:var(--md-sys-color-tertiaryContainer)] text-[color:var(--md-sys-color-onTertiaryContainer)] border border-transparent",
  error: "bg-[color:var(--md-sys-color-errorContainer)] text-[color:var(--md-sys-color-onErrorContainer)] border border-transparent",
  info: "bg-[color:var(--md-sys-color-secondaryContainer)] text-[color:var(--md-sys-color-onSecondaryContainer)] border border-transparent",
};

const sizes = {
  sm: "px-3 py-1 text-[12px]",
  md: "px-3 py-1 text-[13px]",
  lg: "px-4 py-1.5 text-[14px]",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "success" && "bg-green-500",
            variant === "warning" && "bg-yellow-500",
            variant === "error" && "bg-red-500",
            variant === "info" && "bg-blue-500",
            variant === "primary" && "bg-brand-500",
            variant === "default" && "bg-text-muted"
          )}
        />
      )}
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
