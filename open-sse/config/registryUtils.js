const registryModelIndexCache = /* @__PURE__ */ new WeakMap();
function getRegistryModelIndex(registry) {
  let index = registryModelIndexCache.get(registry);
  if (!index) {
    index = /* @__PURE__ */ new Map();
    for (const [providerId, config] of Object.entries(registry)) {
      for (const model of config.models) {
        if (!index.has(model.id)) index.set(model.id, providerId);
      }
    }
    registryModelIndexCache.set(registry, index);
  }
  return index;
}
function parseModelFromRegistry(modelStr, registry) {
  if (!modelStr) return { provider: null, model: null };
  for (const [providerId2, config] of Object.entries(registry)) {
    if (modelStr.startsWith(providerId2 + "/")) {
      return { provider: providerId2, model: modelStr.slice(providerId2.length + 1) };
    }
    if (config.alias && modelStr.startsWith(config.alias + "/")) {
      return { provider: providerId2, model: modelStr.slice(config.alias.length + 1) };
    }
  }
  const providerId = getRegistryModelIndex(registry).get(modelStr);
  if (providerId) {
    return { provider: providerId, model: modelStr };
  }
  return { provider: null, model: modelStr };
}
function getAllModelsFromRegistry(registry, extra) {
  const models = [];
  for (const [providerId, config] of Object.entries(registry)) {
    const extraFields = extra ? extra(providerId, config) : {};
    for (const model of config.models) {
      const entries = [providerId, config.alias].filter(
        (prefix) => typeof prefix === "string" && prefix.length > 0
      );
      for (const prefix of entries) {
        models.push({
          id: `${prefix}/${model.id}`,
          name: model.name,
          provider: providerId,
          ...extraFields
        });
      }
    }
  }
  return models;
}
function buildAuthHeaders(provider, token) {
  if (provider.authType === "none" || provider.authHeader === "none" || !token) {
    return {};
  }
  switch (provider.authHeader) {
    case "key":
      return { Authorization: `Key ${token}` };
    case "token":
      return { Authorization: `Token ${token}` };
    case "xi-api-key":
      return { "xi-api-key": token };
    case "x-api-key":
      return { "x-api-key": token };
    case "x-gladia-key":
      return { "x-gladia-key": token };
    case "bearer":
    default:
      return { Authorization: `Bearer ${token}` };
  }
}
export {
  buildAuthHeaders,
  getAllModelsFromRegistry,
  parseModelFromRegistry
};
