"use client";

import { cn } from "@/shared/utils/cn";

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
  const paddings = {
    none: "",
    xs: "p-3",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div
      className={cn(
        "bg-[color:var(--md-sys-color-surfaceContainer)] border-[color:var(--md-sys-color-outlineVariant)]",
        "rounded-[var(--md-sys-shape-corner-extra-large)]",
        hover && "hover:border-[color:var(--md-sys-color-primary)] hover:shadow-md hover:-translate-y-[1px] cursor-pointer transition-all duration-200",
        paddings[padding],
        className
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="material-symbols-outlined text-[18px] text-[color:var(--md-sys-color-primary)]">{icon}</span>
            )}
            <div>
              {title && <h3 className="text-text-main font-medium text-[16px]">{title}</h3>}
              {subtitle && <p className="text-[13px] text-text-muted">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

Card.Section = function CardSection({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-4 border border-[color:var(--md-sys-color-outlineVariant)] rounded-[var(--md-sys-shape-corner-large)] bg-[color:var(--md-sys-color-surfaceContainerHigh)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Row = function CardRow({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-3 -mx-3 px-3 transition-colors border-b border-[color:var(--md-sys-color-outlineVariant)] last:border-b-0",
        "hover:bg-[color:var(--md-sys-color-surfaceContainerHigh)] transition-colors",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.ListItem = function CardListItem({
  children,
  actions,
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between p-3 -mx-3 px-3 border-b border-border-500 last:border-b-0",
        "hover:bg-surface-2/50 transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
};
