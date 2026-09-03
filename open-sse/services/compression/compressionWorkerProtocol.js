function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isStrictlySerializable(value, seen = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((entry) => isStrictlySerializable(entry, seen));
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((entry) => isStrictlySerializable(entry, seen));
}
const WORKER_STACK_ENGINES = /* @__PURE__ */ new Set(["caveman", "rtk", "standard"]);
function isCompressionWorkerEligible(body, mode, options) {
  if (mode !== "standard" && mode !== "rtk" && mode !== "stacked") return false;
  if (mode === "stacked") {
    const pipeline = options?.config?.stackedPipeline;
    if (!Array.isArray(pipeline) || pipeline.length === 0) return false;
    if (pipeline.some((step) => {
      const engine = typeof step === "string" ? step : step.engine;
      return !WORKER_STACK_ENGINES.has(engine);
    })) {
      return false;
    }
  }
  return isStrictlySerializable({ body, mode, ...options ? { options } : {} });
}
export {
  isCompressionWorkerEligible,
  isStrictlySerializable
};
