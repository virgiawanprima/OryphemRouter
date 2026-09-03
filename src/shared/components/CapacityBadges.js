"use client";

import { CAPACITY_META } from "@/shared/constants/models";
import Tooltip from "./Tooltip";

// Render small icon badges for a model's capabilities (only those set true).
// colorOverride: force a single color class for all badges (default: per-cap color).
// size: icon font-size in px (default 16).
// pricing: optional { input, output, cached } — renders a compact "$in/$out" chip.
export default function CapacityBadges({ caps, pricing, className = "", colorOverride, size = 16 }) {
  const active = caps ? Object.keys(CAPACITY_META).filter((k) => caps[k]) : [];
  const showPricing = pricing && (pricing.input != null || pricing.output != null);

  if (active.length === 0 && !showPricing) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {active.map((k) => (
        <Tooltip key={k} text={`${CAPACITY_META[k].label}: ${CAPACITY_META[k].desc}`}>
          <span
            className={`material-symbols-outlined leading-none cursor-help ${colorOverride || CAPACITY_META[k].color}`}
            style={{ fontSize: `${size}px` }}
          >
            {CAPACITY_META[k].icon}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}
