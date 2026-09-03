import { jsonLength } from "./jsonSize.js";
import { getRegistryEntry } from "./omni/providerRegistry.js";
const DEFAULT_MAX_TIMEOUT_MS = 18e4;
const LARGE_ITEM_THRESHOLD = 150;
const VERY_LARGE_ITEM_THRESHOLD = 400;
const TOOL_HEAVY_THRESHOLD = 15;
const LARGE_CHAR_THRESHOLD = 25e4;
const VERY_LARGE_CHAR_THRESHOLD = 75e4;
function countArrayField(body, field) {
  const value = body?.[field];
  return Array.isArray(value) ? value.length : 0;
}
function estimateBodyChars(body) {
  if (!body) return 0;
  try {
    return jsonLength(body);
  } catch {
    return 0;
  }
}
const OFFICIAL_CLAUDE_FORMAT_PROVIDERS = /* @__PURE__ */ new Set(["claude", "anthropic"]);
function isClaudeFormatReasoningProvider(provider) {
  if (!provider) return false;
  const normalized = provider.toLowerCase();
  if (OFFICIAL_CLAUDE_FORMAT_PROVIDERS.has(normalized)) return false;
  const entry = getRegistryEntry(normalized);
  return entry?.format === "claude";
}
function isCodexGpt5x(provider, model) {
  const normalizedProvider = (provider || "").toLowerCase();
  const normalizedModel = (model || "").toLowerCase();
  return normalizedProvider === "codex" && /gpt-5(\.\d+)?/.test(normalizedModel);
}
function isHighReasoningEffort(model, body) {
  const normalizedModel = (model || "").toLowerCase();
  if (/-high\b/.test(normalizedModel) || normalizedModel.endsWith("-high")) return true;
  const effort = (() => {
    const direct = body?.["reasoning_effort"];
    if (typeof direct === "string") return direct;
    const reasoning = body?.["reasoning"];
    if (reasoning && typeof reasoning === "object") {
      const nested = reasoning["effort"];
      if (typeof nested === "string") return nested;
    }
    return "";
  })();
  return effort.toLowerCase() === "high";
}
function resolveStreamReadinessTimeout(input) {
  const baseTimeoutMs = Math.max(0, Math.floor(input.baseTimeoutMs || 0));
  if (baseTimeoutMs <= 0) {
    return { timeoutMs: baseTimeoutMs, baseTimeoutMs, reasons: ["disabled"] };
  }
  const maxTimeoutMs = Math.max(baseTimeoutMs, input.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS);
  const reasons = [];
  let timeoutMs = baseTimeoutMs;
  const inputCount = countArrayField(input.body, "input");
  const messageCount = countArrayField(input.body, "messages");
  const itemCount = Math.max(inputCount, messageCount);
  const toolCount = countArrayField(input.body, "tools");
  const estimatedChars = estimateBodyChars(input.body);
  const codexGpt5x = isCodexGpt5x(input.provider, input.model);
  const codexHighReasoning = codexGpt5x && isHighReasoningEffort(input.model, input.body);
  if (itemCount > VERY_LARGE_ITEM_THRESHOLD) {
    timeoutMs += 45e3;
    reasons.push("very_large_history");
  } else if (itemCount > LARGE_ITEM_THRESHOLD) {
    timeoutMs += 2e4;
    reasons.push("large_history");
  }
  if (toolCount >= TOOL_HEAVY_THRESHOLD) {
    timeoutMs += 15e3;
    reasons.push("tool_heavy");
  }
  if (estimatedChars > VERY_LARGE_CHAR_THRESHOLD) {
    timeoutMs += 45e3;
    reasons.push("very_large_payload");
  } else if (estimatedChars > LARGE_CHAR_THRESHOLD) {
    timeoutMs += 2e4;
    reasons.push("large_payload");
  }
  if (codexHighReasoning) {
    timeoutMs += 3e4;
    reasons.push("codex_gpt_5_5_high_reasoning");
  } else if (codexGpt5x && (itemCount > LARGE_ITEM_THRESHOLD || toolCount >= TOOL_HEAVY_THRESHOLD)) {
    timeoutMs += 3e4;
    reasons.push("codex_gpt_5_5_large_responses");
  }
  if (isClaudeFormatReasoningProvider(input.provider) && !codexHighReasoning) {
    timeoutMs += 3e4;
    reasons.push("claude_format_heavy_reasoning");
  }
  timeoutMs = Math.min(timeoutMs, maxTimeoutMs);
  if (timeoutMs === baseTimeoutMs) reasons.push("base");
  return { timeoutMs, baseTimeoutMs, reasons };
}
export {
  resolveStreamReadinessTimeout
};
