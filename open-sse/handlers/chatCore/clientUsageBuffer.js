import {
  addBufferToUsage as defaultAddBuffer,
  filterUsageForFormat as defaultFilterUsage,
  estimateUsage as defaultEstimateUsage,
  sanitizeProviderUsageForRequest
} from "../../utils/omni/usageTrackingExtras.js";
const DEFAULT_DEPS = {
  addBufferToUsage: defaultAddBuffer,
  filterUsageForFormat: defaultFilterUsage,
  estimateUsage: defaultEstimateUsage
};
function isEmptyUsage(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return true;
  const u = usage;
  const fields = [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "input_tokens",
    "output_tokens",
    "promptTokenCount",
    "candidatesTokenCount",
    "totalTokenCount"
  ];
  let sawNumber = false;
  for (const key of fields) {
    const v = u[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    sawNumber = true;
    if (v > 0) return false;
  }
  return true;
}
const CONTEXT_BUDGET_TO_VISIBLE_FIELD = {
  context_budget_prompt_tokens: "prompt_tokens",
  context_budget_input_tokens: "input_tokens",
  context_budget_total_tokens: "total_tokens"
};
function foldContextBudgetIntoVisibleUsage(usage) {
  for (const [budgetField, visibleField] of Object.entries(CONTEXT_BUDGET_TO_VISIBLE_FIELD)) {
    const value = usage[budgetField];
    if (typeof value === "number") {
      usage[visibleField] = value;
    }
  }
}
function applyClientUsageBuffer(translatedResponse, body, clientResponseFormat, options = {}, deps = DEFAULT_DEPS) {
  const { preserveContextBudgetInVisibleUsage = false } = options;
  if (translatedResponse?.usage) {
    translatedResponse.usage = sanitizeProviderUsageForRequest(
      translatedResponse.usage,
      body,
      clientResponseFormat
    );
  }
  if (translatedResponse?.usage && !isEmptyUsage(translatedResponse.usage)) {
    const buffered = deps.addBufferToUsage(translatedResponse.usage);
    if (preserveContextBudgetInVisibleUsage) {
      foldContextBudgetIntoVisibleUsage(buffered);
    }
    translatedResponse.usage = deps.filterUsageForFormat(buffered, clientResponseFormat);
  } else {
    const contentLength = JSON.stringify(
      translatedResponse?.choices?.[0]?.message?.content || ""
    ).length;
    if (contentLength > 0) {
      const estimated = deps.estimateUsage(body, contentLength, clientResponseFormat);
      translatedResponse.usage = deps.filterUsageForFormat(estimated, clientResponseFormat);
    }
  }
}
export {
  applyClientUsageBuffer
};
