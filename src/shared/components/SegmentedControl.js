"use client";

import { Segmented as AntSegmented } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Segmented — adapter keeping the app's existing props
// (options [{value,label,icon,disabled}], value, onChange).
const sizeMap = {
  sm: "small",
  md: "middle",
  lg: "large",
};

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  const opts = options.map((o) => ({
    label: o.icon ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] leading-none">{o.icon}</span>
        {o.label}
      </span>
    ) : (
      o.label
    ),
    value: o.value,
    disabled: o.disabled,
  }));

  return (
    <AntSegmented
      options={opts}
      value={value}
      onChange={(v) => onChange(v)}
      size={sizeMap[size] || "middle"}
      className={cn(className)}
      block={false}
    />
  );
}