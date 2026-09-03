import { MODE_PACKS } from "./modePacks.js";
const MODE_PACK_ALIASES = {
  fast: "ship-fast",
  fastest: "ship-fast",
  speed: "ship-fast",
  quality: "quality-first",
  best: "quality-first",
  cheap: "cost-saver",
  cost: "cost-saver",
  saver: "cost-saver",
  reliable: "reliability-first",
  offline: "offline-friendly"
};
function resolveRequestModePack(input) {
  const noOverride = { override: false, modePack: void 0 };
  if (typeof input !== "string") return noOverride;
  const key = input.trim().toLowerCase();
  if (!key) return noOverride;
  if (key === "balanced" || key === "default") return { override: true, modePack: void 0 };
  if (Object.prototype.hasOwnProperty.call(MODE_PACKS, key)) {
    return { override: true, modePack: key };
  }
  const alias = MODE_PACK_ALIASES[key];
  if (alias) return { override: true, modePack: alias };
  return noOverride;
}
function parseRequestBudgetCap(input) {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return void 0;
  return n;
}
function parseRequestBudgetFallback(input) {
  if (typeof input !== "string") return void 0;
  const key = input.trim().toLowerCase();
  if (key === "strict" || key === "block" || key === "hard") return "strict";
  if (key === "cheapest" || key === "cheapest-viable" || key === "soft") return "cheapest";
  return void 0;
}
function resolveRequestAutoControls(headers) {
  const modeHeader = headers.get("x-omniroute-mode")?.trim() || null;
  const budgetHeader = headers.get("x-omniroute-budget")?.trim() || null;
  const budgetFallbackHeader = headers.get("x-omniroute-budget-fallback")?.trim() || null;
  const mode = resolveRequestModePack(modeHeader);
  const budgetCap = parseRequestBudgetCap(budgetHeader);
  const budgetFallback = parseRequestBudgetFallback(budgetFallbackHeader);
  return {
    ...mode.override && modeHeader ? { mode: modeHeader } : {},
    ...budgetCap !== void 0 ? { budgetCap } : {},
    ...budgetFallback !== void 0 ? { budgetFallback } : {}
  };
}
export {
  parseRequestBudgetCap,
  parseRequestBudgetFallback,
  resolveRequestAutoControls,
  resolveRequestModePack
};
