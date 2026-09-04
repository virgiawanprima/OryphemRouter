"use client";

import { useId } from "react";
import { Input as AntInput } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Input — adapter keeping the app's existing props (label, error,
// hint, icon). Ant Design form controls inherit ConfigProvider's M3-aligned
// theme automatically.
export default function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  hint,
  icon,
  disabled = false,
  required = false,
  className,
  inputClassName,
  ...props
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-text-main">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <AntInput
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        prefix={icon ? <span className="material-symbols-outlined text-[18px] text-text-muted">{icon}</span> : undefined}
        status={error ? "error" : undefined}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          // iOS zoom fix
          "text-[16px] sm:text-sm",
          inputClassName
        )}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}