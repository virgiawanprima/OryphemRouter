const BYTE_PRESERVING_PROVIDERS = /* @__PURE__ */ new Set(["anthropic", "claude"]);
function resolveOmniGlyphTransport(provider) {
  const normalized = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  if (BYTE_PRESERVING_PROVIDERS.has(normalized)) {
    return {
      providerTransport: "direct",
      imageTransportFidelity: "byte-preserving"
    };
  }
  return {
    providerTransport: "aggregator",
    imageTransportFidelity: "unknown"
  };
}
export {
  resolveOmniGlyphTransport
};
