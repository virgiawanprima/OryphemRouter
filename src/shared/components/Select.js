"use client";

import { useId } from "react";
import { Select as AntSelect } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Select — adapter keeping the app's existing props (options,
// label, error, hint, placeholder).
export default function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = "Select an option",
  error,
  hint,
  disabled = false,
  required = false,
  className,
  selectClassName,
  ...props
}) {
  const generatedId = useId();
  const inputId = props.id || generatedId;
  const describedBy = [error ? `${inputId}-error` : null, hint && !error ? `${inputId}-hint` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-main">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <AntSelect
        id={inputId}
        value={value === "" ? undefined : value}
        onChange={onChange}
        disabled={disabled}
        status={error ? "error" : undefined}
        placeholder={placeholder}
        options={options}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn("w-full", selectClassName)}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-red-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}