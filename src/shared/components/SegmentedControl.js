"use client";

import { cn } from "@/shared/utils/cn";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  const sizes = {
    sm: "h-7 text-xs",
    md: "h-9 text-sm",
    lg: "h-11 text-base",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center p-1 rounded-[var(--md-sys-shape-corner-full)] overflow-x-auto",
        "bg-[color:var(--md-sys-color-surfaceContainerHigh)]",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={option.disabled}
          aria-pressed={value === option.value}
          className={cn(
            "shrink-0 px-4 rounded-[var(--md-sys-shape-corner-full)] font-medium transition-colors",
            sizes[size],
            "disabled:opacity-50 disabled:cursor-not-allowed",
            value === option.value
              ? "bg-[color:var(--md-sys-color-secondaryContainer)] text-[color:var(--md-sys-color-onSecondaryContainer)]"
              : "text-[color:var(--md-sys-color-onSurfaceVariant)] hover:text-text-main"
          )}
        >
          {option.icon && (
            <span className="material-symbols-outlined text-[16px] mr-1.5">
              {option.icon}
            </span>
          )}
          {option.label}
        </button>
      ))}
    </div>
  );
}
