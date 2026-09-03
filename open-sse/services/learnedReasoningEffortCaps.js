import { log } from "../utils/log.js";
const REASONING_EFFORT_ORDER = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra"
];
const learnedCaps = /* @__PURE__ */ new Map();
function buildKey(provider, model) {
  const p = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const m = typeof model === "string" ? model.trim().toLowerCase() : "";
  if (!p || !m) return "";
  return `${p}:${m}`;
}
function rankOf(value) {
  return REASONING_EFFORT_ORDER.indexOf(value);
}
function isSubset(a, b) {
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
function getLearnedReasoningEffort(provider, model) {
  const key = buildKey(provider, model);
  if (!key) return null;
  const v = learnedCaps.get(key);
  return v ? new Set(v) : null;
}
function getLearnedReasoningEffortForModel(model) {
  const m = typeof model === "string" ? model.trim().toLowerCase() : "";
  if (!m || learnedCaps.size === 0) return null;
  let result = null;
  for (const [key, value] of learnedCaps) {
    const colon = key.indexOf(":");
    if (colon === -1 || key.slice(colon + 1) !== m) continue;
    result = result ? new Set([...result].filter((v) => value.has(v))) : new Set(value);
  }
  return result && result.size > 0 ? result : null;
}
function recordLearnedReasoningEffort(provider, model, acceptedValues) {
  const key = buildKey(provider, model);
  if (!key) return null;
  const newSet = /* @__PURE__ */ new Set();
  for (const raw of acceptedValues) {
    const lowered = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (lowered && REASONING_EFFORT_ORDER.includes(lowered)) newSet.add(lowered);
  }
  if (newSet.size === 0) {
    log.warn(
      "REASONING-CAPS",
      `[learnedReasoningEffortCaps] unrecognized reasoning_effort enum for ${key}: ${acceptedValues.join(", ")} \u2014 nothing learned`
    );
    return null;
  }
  const existing = learnedCaps.get(key);
  if (existing !== void 0) {
    if (isSubset(existing, newSet)) return new Set(existing);
    if (isSubset(newSet, existing)) {
      learnedCaps.set(key, newSet);
      return new Set(newSet);
    }
    return new Set(existing);
  }
  learnedCaps.set(key, newSet);
  return new Set(newSet);
}
function clampToLearned(effortStr, accepted) {
  if (!effortStr || accepted.has(effortStr)) return null;
  const rank = rankOf(effortStr);
  if (rank === -1) return null;
  let nearestAbove = null;
  let nearestAboveRank = Infinity;
  let highest = null;
  let highestRank = -1;
  for (const v of accepted) {
    const r = rankOf(v);
    if (r < 0) continue;
    if (r >= rank && r < nearestAboveRank) {
      nearestAboveRank = r;
      nearestAbove = v;
    }
    if (r > highestRank) {
      highestRank = r;
      highest = v;
    }
  }
  return nearestAbove ?? highest;
}
const LIST_INTRO = /(?:expected one of|supported (?:types|values) are|please use)[:\s]*([^.]+)/i;
function parseReasoningEffortEnum(errText) {
  if (typeof errText !== "string" || !errText) return null;
  const match = LIST_INTRO.exec(errText);
  if (!match) return null;
  const tokens = match[1].split(/,|\b(?:and|or)\b|&/i).map(
    (t) => t.replace(/`/g, "").replace(/\([^)]*\)/g, "").trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "")
  ).filter((t) => t.length > 0 && REASONING_EFFORT_ORDER.includes(t));
  return tokens.length > 0 ? tokens : null;
}
function __test_resetLearnedReasoningEffortCaps() {
  learnedCaps.clear();
}
export {
  REASONING_EFFORT_ORDER,
  __test_resetLearnedReasoningEffortCaps,
  clampToLearned,
  getLearnedReasoningEffort,
  getLearnedReasoningEffortForModel,
  parseReasoningEffortEnum,
  recordLearnedReasoningEffort
};
