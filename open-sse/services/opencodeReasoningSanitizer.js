const OPENCODE_GO_PROVIDERS = /* @__PURE__ */ new Set(["ollama-cloud", "opencode-go", "opencode", "opencode-zen"]);
function isOpencodeGoProvider(provider) {
  return OPENCODE_GO_PROVIDERS.has(provider);
}
function stripBooleanReasoning(body) {
  if (!body || typeof body !== "object") return body;
  if (!("reasoning" in body)) return body;
  const reasoning = body.reasoning;
  if (typeof reasoning !== "boolean") return body;
  const next = { ...body };
  delete next.reasoning;
  return next;
}
export {
  isOpencodeGoProvider,
  stripBooleanReasoning
};
