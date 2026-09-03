const OUTPUT_TOKEN_FIELDS = [
  "max_tokens",
  "max_completion_tokens",
  "max_output_tokens"
];
function getOutputTokenAdjustment(field, value, effectiveCap) {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || value <= 0) return { field, remove: true };
  const capped = Math.min(Math.floor(value), effectiveCap);
  return capped === value ? null : { field, value: capped };
}
function hasTranslatorOutputTokenLimit(body) {
  return ["max_tokens", "max_completion_tokens"].some((field) => {
    const value = body[field];
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  });
}
function adjustOutputTokenFields(body, effectiveCap) {
  const adjustments = OUTPUT_TOKEN_FIELDS.map(
    (field) => getOutputTokenAdjustment(field, body[field], effectiveCap)
  ).filter((adjustment) => adjustment !== null);
  if (adjustments.length === 0) return { body, adjustedFields: [] };
  const nextBody = { ...body };
  for (const adjustment of adjustments) {
    if (adjustment.remove) delete nextBody[adjustment.field];
    else nextBody[adjustment.field] = adjustment.value;
  }
  return { body: nextBody, adjustedFields: adjustments.map(({ field }) => field) };
}
function enforceOutputTokenBudget(body, estimatedInputTokens, contextLimit, defaultOutputTokens = 0, maxOutputTokenCap, maxInputTokenCap) {
  const normalizedInputTokens = Math.max(0, Math.ceil(estimatedInputTokens));
  const normalizedContextLimit = Math.max(1, Math.floor(contextLimit));
  const normalizedDefaultOutputTokens = Math.max(0, Math.floor(defaultOutputTokens));
  const availableOutputTokens = normalizedContextLimit - normalizedInputTokens;
  const normalizedInputCap = maxInputTokenCap == null ? null : Math.floor(maxInputTokenCap);
  if (normalizedInputCap !== null && normalizedInputCap > 0 && normalizedInputTokens > normalizedInputCap) {
    return {
      ok: false,
      estimatedInputTokens: normalizedInputTokens,
      contextLimit: normalizedContextLimit,
      maxInputTokens: normalizedInputCap
    };
  }
  if (availableOutputTokens < 1) {
    return {
      ok: false,
      estimatedInputTokens: normalizedInputTokens,
      contextLimit: normalizedContextLimit
    };
  }
  const normalizedOutputCap = maxOutputTokenCap == null ? null : Math.floor(maxOutputTokenCap);
  const effectiveCap = normalizedOutputCap !== null && normalizedOutputCap > 0 ? Math.min(availableOutputTokens, normalizedOutputCap) : availableOutputTokens;
  if (!body) {
    if (normalizedDefaultOutputTokens > availableOutputTokens) {
      return {
        ok: false,
        estimatedInputTokens: normalizedInputTokens,
        contextLimit: normalizedContextLimit
      };
    }
    return {
      ok: true,
      body: {},
      availableOutputTokens,
      adjustedFields: []
    };
  }
  if (normalizedDefaultOutputTokens > availableOutputTokens && !hasTranslatorOutputTokenLimit(body)) {
    return {
      ok: false,
      estimatedInputTokens: normalizedInputTokens,
      contextLimit: normalizedContextLimit
    };
  }
  const adjusted = adjustOutputTokenFields(body, effectiveCap);
  return { ok: true, ...adjusted, availableOutputTokens };
}
export {
  OUTPUT_TOKEN_FIELDS,
  enforceOutputTokenBudget
};
