// Ported from OmniRoute src/shared/utils/numeric.ts (canonical numeric coercion helpers).
// Self-contained leaf — full port, no deep infra.

/** Coerce an unknown value to a finite number, or `fallback` (default `0`). */
export function toNumber(v, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const parsed = Number(v.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Coerce an unknown value to a finite number, or `null` when coercion fails. */
export function toNumberOrNull(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const parsed = Number(v.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Coerce an unknown value to an array of finite numbers. */
export function toNumberArray(v, fallback = []) {
  if (!Array.isArray(v)) return fallback;
  return v.map((item) => toNumber(item, 0));
}
