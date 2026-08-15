"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  default: "border-2 border-border-500 text-text-main",
  primary: "border-2 border-brand-600 text-brand-600 dark:text-brand-300",
  success: "border-2 border-green-600 text-green-600 dark:text-green-400",
  warning: "border-2 border-yellow-600 text-yellow-600 dark:text-yellow-400",
  error: "border-2 border-red-600 text-red-600 dark:text-red-400",
  info: "border-2 border-blue-600 text-blue-600 dark:text-blue-400",
};

const sizes = {
  sm: "px-2 py-0.5 text-[10px] border-2 border-border-500",
  md: "px-2.5 py-1 text-xs border-2 border-border-500",
  lg: "px-3 py-1.5 text-sm border-2 border-border-500",
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
            "size-1.5 rounded-[0px] border-2 border-border-500",
            variant === "success" && "text-green-600",
            variant === "warning" && "text-yellow-600",
            variant === "error" && "text-red-600",
            variant === "info" && "text-blue-600",
            variant === "primary" && "text-brand-600",
            variant === "default" && "text-text-main"
          )}
        />
      )}
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
