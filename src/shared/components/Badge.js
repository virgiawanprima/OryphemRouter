"use client";

import { Tag } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Tag — adapter keeping the app's variant/size/dot/icon API.
// antd color values are mapped from the app's semantic variants.
const colorMap = {
  teal: "cyan",
  blue: "geekblue",
  primary: "geekblue",
  info: "geekblue",
  amber: "orange",
  warning: "orange",
  red: "error",
  error: "error",
  neutral: "default",
  success: "success",
  green: "success",
  default: "default",
};

const sizeClasses = {
  sm: "text-[12px] leading-none px-2 py-0.5",
  md: "text-[13px] leading-none px-2.5 py-1",
  lg: "text-[14px] leading-none px-3 py-1.5",
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
    <Tag
      color={colorMap[variant] || "default"}
      icon={dot || icon ? <span className={cn("material-symbols-outlined text-[12px]")}>{icon || "circle"}</span> : undefined}
      className={cn("inline-flex items-center gap-1 rounded-full font-medium border-0", sizeClasses[size], className)}
    >
      {children}
    </Tag>
  );
}