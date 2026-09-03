const GEMINI_STEPDOWN = [32768, 24576, 8192];
const GEMINI_FALLBACK_THINKING_CAP = GEMINI_STEPDOWN[0];
const learnedCaps = /* @__PURE__ */ new Map();
function buildKey(provider, model) {
  const p = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const m = typeof model === "string" ? model.trim().toLowerCase() : "";
  if (!p || !m) return "";
  return `${p}:${m}`;
}
function getLearnedThinkingCap(provider, model) {
  const key = buildKey(provider, model);
  if (!key) return null;
  return learnedCaps.get(key) ?? null;
}
function recordLearnedThinkingCap(provider, model, failedBudget) {
  const key = buildKey(provider, model);
  if (!key) return null;
  if (!Number.isFinite(failedBudget)) return null;
  const nextStep = GEMINI_STEPDOWN.find((step) => step < failedBudget);
  if (nextStep === void 0) return null;
  const existing = learnedCaps.get(key);
  if (existing !== void 0 && existing <= nextStep) {
    return existing;
  }
  learnedCaps.set(key, nextStep);
  return nextStep;
}
function parseThinkingBudgetMax(errText) {
  if (typeof errText !== "string" || !errText) return null;
  const match = /thinking_?budget[^\d-]*(?:must be in the range|range)[^\d-]*\[\s*-?\d+\s*,\s*(\d+)\s*\]/i.exec(
    errText
  );
  if (!match) return null;
  const max = Number(match[1]);
  return Number.isFinite(max) ? max : null;
}
function __test_resetLearnedThinkingCaps() {
  learnedCaps.clear();
}
export {
  GEMINI_FALLBACK_THINKING_CAP,
  __test_resetLearnedThinkingCaps,
  getLearnedThinkingCap,
  parseThinkingBudgetMax,
  recordLearnedThinkingCap
};
