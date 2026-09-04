"use client";

import { Button as AntButton, Spin } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Button — maps the app's icon+loading contract onto antd.
const typeMap = {
  primary: "primary",
  secondary: "default",
  ghost: "text",
  danger: "primary",
  success: "primary",
  outline: "default",
  default: "default",
  text: "text",
  link: "link",
};

const sizeMap = {
  sm: "small",
  md: "middle",
  lg: "large",
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
  danger = false,
  ...props
}) {
  const antType = typeMap[variant] || "default";
  const isDanger = variant === "danger" || variant === "error";
  const antIconNode = loading ? <Spin size="small" /> : icon ? (
    <span className="material-symbols-outlined text-[18px] leading-none">{icon}</span>
  ) : null;

  return (
    <AntButton
      type={antType}
      size={sizeMap[size] || "middle"}
      danger={danger || isDanger}
      disabled={disabled}
      loading={loading}
      icon={antIconNode}
      className={cn(
        "font-semibold",
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {children}
      {iconRight && !loading && (
        <span className="material-symbols-outlined ml-1 text-[18px] leading-none">{iconRight}</span>
      )}
    </AntButton>
  );
}