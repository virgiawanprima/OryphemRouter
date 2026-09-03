const AGENTROUTER_RULES = [
  {
    id: "agentrouter-quota-misstatus",
    fromStatuses: /* @__PURE__ */ new Set([403, 400]),
    toStatus: 429,
    textMarkers: ["\u989D\u5EA6\u4E0D\u8DB3"],
    excludeMarkers: ["\u65E0\u6743\u8BBF\u95EE"],
    defaultRetryAfterMs: 6e4
  }
];
const statusRestatementRegistry = /* @__PURE__ */ new Map([
  ["agentrouter", AGENTROUTER_RULES]
]);
function stringifyBody(body) {
  if (body === null || body === void 0) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return "";
  }
}
function applyStatusRestatement(input) {
  const passthrough = {
    status: input.status,
    retryAfterMs: input.retryAfterMs ?? null,
    ruleId: null,
    fromStatus: input.status
  };
  if (!input.provider) return passthrough;
  const rules = statusRestatementRegistry.get(input.provider.toLowerCase());
  if (!rules) return passthrough;
  const haystack = `${input.message ?? ""} ${stringifyBody(input.body)}`.toLowerCase();
  if (!haystack.trim()) return passthrough;
  for (const rule of rules) {
    if (!rule.fromStatuses.has(input.status)) continue;
    if (!rule.textMarkers.some((marker) => haystack.includes(marker))) continue;
    if (rule.excludeMarkers?.some((marker) => haystack.includes(marker))) continue;
    const upstreamRetryAfterMs = typeof input.retryAfterMs === "number" && input.retryAfterMs > 0 ? input.retryAfterMs : null;
    return {
      status: rule.toStatus,
      retryAfterMs: upstreamRetryAfterMs ?? rule.defaultRetryAfterMs ?? null,
      ruleId: rule.id,
      fromStatus: input.status
    };
  }
  return passthrough;
}
export {
  applyStatusRestatement,
  statusRestatementRegistry
};
