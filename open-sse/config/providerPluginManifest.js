const SIDECAR_COMPATIBLE_EXECUTORS = /* @__PURE__ */ new Set(["default"]);
function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== void 0)
  );
}
function mapModel(model) {
  return compactObject({
    id: model.id,
    name: model.name,
    contextLength: model.contextLength,
    maxOutputTokens: model.maxOutputTokens,
    toolCalling: model.toolCalling,
    supportsReasoning: model.supportsReasoning,
    supportsVision: model.supportsVision,
    supportsVideo: model.supportsVideo,
    unsupportedParams: model.unsupportedParams,
    targetFormat: model.targetFormat
  });
}
function sidecarEligibility(entry) {
  const reasons = [];
  if (!SIDECAR_COMPATIBLE_EXECUTORS.has(entry.executor)) {
    reasons.push(`custom executor: ${entry.executor}`);
  }
  if (entry.authType !== "apikey" && entry.authType !== "optional" && entry.authType !== "none") {
    reasons.push(`auth type requires TS handling: ${entry.authType}`);
  }
  if (!entry.baseUrl && !entry.baseUrls?.length && !entry.responsesBaseUrl) {
    reasons.push("no static upstream endpoint");
  }
  if (typeof entry.urlBuilder === "function") {
    reasons.push("dynamic URL builder");
  }
  if (entry.oauth) {
    reasons.push("oauth metadata");
  }
  if (entry.poolConfig) {
    reasons.push("session pool config");
  }
  return {
    eligible: reasons.length === 0,
    reasons
  };
}
function capabilitiesFor(entry, eligible) {
  const capabilities = /* @__PURE__ */ new Set();
  if (entry.authType === "apikey" || entry.authType === "optional") {
    capabilities.add("apikey");
  }
  if (entry.authType === "oauth" || entry.oauth) {
    capabilities.add("oauth");
  }
  if (entry.responsesBaseUrl) {
    capabilities.add("responses");
  }
  if (entry.passthroughModels) {
    capabilities.add("passthrough-models");
  }
  if (entry.executor !== "default") {
    capabilities.add("custom-executor");
  }
  if (eligible) {
    capabilities.add("sidecar-candidate");
  }
  return [...capabilities].sort();
}
function createProviderPluginManifestEntry(entry) {
  const sidecar = sidecarEligibility(entry);
  return {
    id: entry.id,
    ...entry.alias ? { alias: entry.alias } : {},
    format: entry.format,
    executor: entry.executor,
    auth: compactObject({
      type: entry.authType,
      header: entry.authHeader,
      prefix: entry.authPrefix
    }),
    endpoints: compactObject({
      baseUrl: entry.baseUrl,
      baseUrls: entry.baseUrls,
      responsesBaseUrl: entry.responsesBaseUrl,
      chatPath: entry.chatPath,
      modelsUrl: entry.modelsUrl
    }),
    capabilities: capabilitiesFor(entry, sidecar.eligible),
    passthroughModels: entry.passthroughModels === true,
    ...typeof entry.defaultContextLength === "number" ? { defaultContextLength: entry.defaultContextLength } : {},
    ...typeof entry.timeoutMs === "number" ? { timeoutMs: entry.timeoutMs } : {},
    models: (entry.models ?? []).map(mapModel),
    sidecar
  };
}
function generateProviderPluginManifestFromRegistry(registry) {
  return {
    schemaVersion: 1,
    generatedFrom: "open-sse/config/providers",
    providers: Object.values(registry).map(createProviderPluginManifestEntry).sort((a, b) => a.id.localeCompare(b.id))
  };
}
function createServiceBackendManifestEntry(pluginId, template) {
  return {
    id: pluginId,
    ...template,
    models: []
  };
}
function getProviderPluginManifestEntryFromRegistry(registry, provider) {
  const entry = registry[provider] || Object.values(registry).find((candidate) => candidate.alias === provider);
  return entry ? createProviderPluginManifestEntry(entry) : null;
}
export {
  createProviderPluginManifestEntry,
  createServiceBackendManifestEntry,
  generateProviderPluginManifestFromRegistry,
  getProviderPluginManifestEntryFromRegistry
};
