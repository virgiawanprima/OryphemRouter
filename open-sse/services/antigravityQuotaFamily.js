const ANTIGRAVITY_PROVIDER_ID = "antigravity";
function normalizeModelId(model) {
  return String(model || "").trim().toLowerCase();
}
function getAntigravityQuotaFamily(model) {
  const normalized = normalizeModelId(model).replace(/^(antigravity|agy)\//, "");
  const slashIndex = normalized.indexOf("/");
  const bare = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
  if (bare.startsWith("gemini-") || bare.includes("/gemini-") || bare.includes("gemini")) {
    return "gemini";
  }
  if (bare.startsWith("claude-") || bare.startsWith("cloud-") || bare.includes("/claude-") || bare.includes("/cloud-") || bare.includes("anthropic")) {
    return "claude";
  }
  return "other";
}
function getQuotaScopedModelForProvider(provider, model) {
  if (!model) return null;
  if (provider !== "antigravity" && provider !== "agy") return model;
  const family = getAntigravityQuotaFamily(model);
  return family === "other" ? model : `family:${family}`;
}
function getQuotaScopeLabelForProvider(provider, model) {
  if (provider !== "antigravity" && provider !== "agy") return "model";
  return getAntigravityQuotaFamily(model) === "other" ? "model" : "family";
}
export {
  getAntigravityQuotaFamily,
  getQuotaScopeLabelForProvider,
  getQuotaScopedModelForProvider
};
