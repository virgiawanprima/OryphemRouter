import crypto from "node:crypto";
const MEMO_CAP = 5e3;
const memoMap = /* @__PURE__ */ new Map();
const DETERMINISTIC_ENGINES = /* @__PURE__ */ new Set(["lite", "caveman", "rtk"]);
const DETERMINISTIC_MODES = /* @__PURE__ */ new Set(["lite", "standard", "rtk"]);
function isDeterministicMode(mode, config) {
  if (mode === "stacked") {
    const pipeline = config?.stackedPipeline;
    if (!pipeline || pipeline.length === 0) return false;
    return pipeline.every((step) => DETERMINISTIC_ENGINES.has(step.engine));
  }
  return DETERMINISTIC_MODES.has(mode);
}
function sha256hex(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
function makeMemoKey(body, mode, config, principalId, model, supportsVision) {
  const bodyHash = sha256hex(JSON.stringify(body));
  const isVisionDependent = usesVisionDependentEngine(mode, config);
  return sha256hex(
    JSON.stringify({
      bodyHash,
      mode,
      config,
      principalId: principalId ?? null,
      model: isVisionDependent ? model ?? null : null,
      supportsVision: isVisionDependent ? supportsVision ?? null : null
    })
  );
}
function usesVisionDependentEngine(mode, config) {
  if (mode === "lite") return true;
  if (mode === "standard") return true;
  if (mode === "stacked") {
    const pipeline = config?.stackedPipeline;
    if (!pipeline || pipeline.length === 0) return false;
    return pipeline.some((step) => step.engine === "lite");
  }
  return false;
}
function boundedSet(key, value) {
  if (!memoMap.has(key) && memoMap.size >= MEMO_CAP) {
    const firstKey = memoMap.keys().next().value;
    if (firstKey !== void 0) {
      memoMap.delete(firstKey);
    }
  }
  memoMap.set(key, value);
}
function memoLookup(key) {
  const hit = memoMap.get(key);
  if (!hit) return null;
  return JSON.parse(JSON.stringify(hit));
}
function memoStore(key, result) {
  boundedSet(key, JSON.parse(JSON.stringify(result)));
}
function clearMemoStore() {
  memoMap.clear();
}
export {
  MEMO_CAP,
  clearMemoStore,
  isDeterministicMode,
  makeMemoKey,
  memoLookup,
  memoStore
};
