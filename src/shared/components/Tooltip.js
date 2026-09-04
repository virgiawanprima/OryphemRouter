"use client";

import { useId } from "react";

export default function Tooltip({ text, children, position = "top", color }) {
  const tooltipId = useId();
  const posClass = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  }[position];

  const bgStyle = color ? { backgroundColor: color } : { backgroundColor: "var(--md-sys-color-inverseSurface)" };

  return (
    <div className="relative inline-flex group/tt">
      {children}
      <div
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute ${posClass} z-50 w-max max-w-56 rounded-[var(--md-sys-shape-corner-small)] px-2 py-1 text-[11px] leading-snug opacity-0 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 transition-opacity duration-150 whitespace-normal`}
        style={bgStyle}
      >
        <span style={{ color: "var(--md-sys-color-inverseOnSurface)" }}>{text}</span>
      </div>
    </div>
  );
}
