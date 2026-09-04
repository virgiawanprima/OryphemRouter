"use client";

import { useId } from "react";
import { Switch } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Switch — adapter keeping the app's existing API contract.
// App API: onChange(nextValue) passes the NEW value (like a checkbox toggle).
export default function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  className,
  ...props
}) {
  const id = useId();
  const labelId = `${id}-label`;

  const sizeMap = {
    sm: { w: 28, h: 16, handle: 12, gap: 3 },
    md: { w: 40, h: 22, handle: 16, gap: 4 },
    lg: { w: 52, h: 30, handle: 22, gap: 6 },
  };
  const sz = sizeMap[size] || sizeMap.md;

  return (
    <div className={cn("flex items-center gap-3", disabled && "opacity-60", className)}>
      <Switch
        size="default"
        checked={checked}
        onChange={(v) => { if (!disabled && onChange) onChange(v); }}
        disabled={disabled}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? props["aria-label"] : undefined}
        style={{ minWidth: sz.w, width: sz.w, height: sz.h }}
        className="antd-switch-ryp"
        {...props}
      />
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span id={labelId} className="text-sm font-medium text-text-main">{label}</span>
          )}
          {description && (
            <span className="text-xs text-text-muted">{description}</span>
          )}
        </div>
      )}
    </div>
  );
}