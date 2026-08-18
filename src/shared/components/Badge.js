"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  default: "border border-border text-text-muted",
  teal: "bg-c-teal-50/10 text-c-teal-800 border border-c-teal-600/30",
  blue: "bg-c-blue-50/10 text-c-blue-800 border border-c-blue-600/30",
  amber: "bg-c-amber-50/10 text-c-amber-800 border border-c-amber-600/30",
  red: "bg-c-red-50/10 text-c-red-800 border border-c-red-600/30",
  primary: "bg-c-blue-50/10 text-c-blue-800 border border-c-blue-600/30",
  success: "bg-c-teal-50/10 text-c-teal-800 border border-c-teal-600/30",
  warning: "bg-c-amber-50/10 text-c-amber-800 border border-c-amber-600/30",
  error: "bg-c-red-50/10 text-c-red-800 border border-c-red-600/30",
  info: "bg-c-blue-50/10 text-c-blue-800 border border-c-blue-600/30",
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
