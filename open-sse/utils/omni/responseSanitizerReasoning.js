// ADAPTED STUB — ported from OmniRoute open-sse/handlers/responseSanitizer/reasoning.ts
// Only the textual-reasoning-tag routing helpers are needed (by thinkTagParser.js).
// These are self-contained (no external deps), so this is a near-verbatim port.

export function normalizeReasoningRouteId(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function isAntigravityReasoningRoute(providerId, modelId) {
  return (
    providerId.includes("antigravity") ||
    providerId === "agy" ||
    modelId.includes("antigravity/") ||
    modelId.startsWith("agy/")
  );
}

export function isTextualReasoningTagNativeRoute(providerId, modelId) {
  const routeId = `${providerId}/${modelId}`;
  return (
    /deepseek[-_/]?r1\b/.test(routeId) ||
    /r1[-_/]?distill\b/.test(routeId) ||
    /(?:^|[/:_-])qwq(?:[/._:-]|$)/.test(routeId) ||
    /(?:^|[/_-])k3(?:[/._:-]|$)/.test(modelId) ||
    (providerId !== "minimax" && providerId !== "minimax-cn" && /minimax[-_]?m3\b/.test(routeId))
  );
}

export function shouldParseTextualReasoningTags(provider, model) {
  const providerId = normalizeReasoningRouteId(provider);
  const modelId = normalizeReasoningRouteId(model);
  return (
    !isAntigravityReasoningRoute(providerId, modelId) &&
    isTextualReasoningTagNativeRoute(providerId, modelId)
  );
}
