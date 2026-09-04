"use client";

import { Card as AntCard } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Card — adapter keeping the app's existing props (title, subtitle,
// icon, action, padding, hover). antd Card handles the enterprise look:
// bordered surface, 16px radius (ConfigProvider), hoverable shadow.
const paddingMap = {
  none: 0,
  xs: 12,
  sm: 16,
  md: 24,
  lg: 32,
};

export default function Card({
  children,
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  hover = false,
  elev = false,
  className,
  ...props
}) {
  const headerNode =
    title || action ? (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="material-symbols-outlined text-[18px] text-[color:var(--md-sys-color-primary)]">{icon}</span>
          )}
          <div>
            {title && <div className="text-text-main font-medium text-[16px] leading-tight">{title}</div>}
            {subtitle && <div className="text-[13px] text-text-muted">{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
    ) : null;

  return (
    <AntCard
      className={cn("w-full antd-card-ryp", className)}
      styles={{
        body: { padding: paddingMap[padding] ?? 24 },
        header: title || action ? { minHeight: 0, padding: `${(paddingMap[padding] ?? 24) / 2}px ${paddingMap[padding] ?? 24}px`, borderBottom: "1px solid rgba(128,128,128,0.18)" } : { display: "none" },
      }}
      title={headerNode}
      hoverable={hover}
      {...props}
    >
      {children}
    </AntCard>
  );
}