"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  default: "border border-border-500 text-text-muted bg-surface-2/50",
  primary: "border border-brand-500/40 text-brand-700 dark:text-brand-300 bg-brand-500/10",
  success: "border border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/10",
  warning: "border border-yellow-500/40 text-yellow-700 dark:text-yellow-400 bg-yellow-500/10",
  error: "border border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10",
  info: "border border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10",
};

const sizes = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
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
