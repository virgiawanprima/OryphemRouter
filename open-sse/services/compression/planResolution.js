import { resolveCompressionPlan } from "./resolveCompressionPlan.js";
import {
  deriveDefaultPlan
} from "./deriveDefaultPlan.js";
const MAX_COMPRESSION_ANNOTATION_BYTES = 768;
const NON_ASCII_HEADER_VALUE_CHARS = /[^\x20-\x7e]/g;
function utf8ByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}
function withSource(plan, source) {
  return { ...plan, source };
}
function planFromHeader(config, header, combos) {
  const h = header.trim();
  if (!h) return null;
  const lower = h.toLowerCase();
  if (lower === "off") return withSource({ mode: "off", stackedPipeline: [] }, "request-header");
  if (lower === "default") {
    return withSource(deriveDefaultPlanFromConfig(config, null, {}), "request-header");
  }
  if (lower.startsWith("engine:")) {
    const id = lower.slice("engine:".length).trim();
    const engine = config.engines?.[id];
    return engine?.enabled ? withSource(deriveDefaultPlan({ [id]: engine }, true), "request-header") : null;
  }
  const combo = combos[lower] ?? combos[h];
  return combo ? withSource({ mode: "stacked", stackedPipeline: combo }, "request-header") : null;
}
function formatCompressionMeta(plan) {
  return `${plan.mode}; source=${plan.source ?? "off"}`;
}
function formatCompressionAnnotation(stats) {
  const rules = stats.rulesApplied;
  if (!rules || rules.length === 0) return "";
  const counts = /* @__PURE__ */ new Map();
  for (const rule of rules) {
    const safeRule = rule.replace(NON_ASCII_HEADER_VALUE_CHARS, "?");
    counts.set(safeRule, (counts.get(safeRule) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const prefix = `tokens=${stats.originalTokens}->${stats.compressedTokens}; rules: `;
  const suffix = ", ...";
  const parts = [];
  let bytes = utf8ByteLength(prefix);
  for (const [name, n] of sorted) {
    const part = `${name}x${n}`;
    const separator = parts.length > 0 ? ", " : "";
    const partBytes = utf8ByteLength(separator + part);
    if (bytes + partBytes > MAX_COMPRESSION_ANNOTATION_BYTES - utf8ByteLength(suffix)) {
      if (parts.length === 0) return "";
      return `${prefix}${parts.join(", ")}${suffix}`;
    }
    parts.push(part);
    bytes += partBytes;
  }
  const agg = parts.join(", ");
  return `${prefix}${agg}`;
}
function buildNamedComboLookup(combos) {
  const map = {};
  for (const c of combos) {
    map[c.id] = c.pipeline;
    const name = c.name?.trim();
    if (name) map[name.toLowerCase()] = c.pipeline;
  }
  return map;
}
function deriveDefaultPlanFromConfig(config, comboId, combos = {}) {
  if (config.enginesExplicit) {
    return resolveCompressionPlan(config, { comboId, combos });
  }
  const legacyMode = config.defaultMode;
  if (legacyMode && legacyMode !== "off") {
    return legacyMode === "stacked" ? { mode: legacyMode, stackedPipeline: config.stackedPipeline ?? [] } : { mode: legacyMode, stackedPipeline: [] };
  }
  return { mode: "off", stackedPipeline: [] };
}
export {
  buildNamedComboLookup,
  deriveDefaultPlanFromConfig,
  formatCompressionAnnotation,
  formatCompressionMeta,
  planFromHeader,
  withSource
};
