const sources = /* @__PURE__ */ new Map();
function registerDynamicImageModelSource(providerId, source) {
  sources.set(providerId, source);
}
function getDynamicImageModels(providerId) {
  const source = sources.get(providerId);
  if (!source) return [];
  return source();
}
function resetDynamicImageModelSources() {
  sources.clear();
}
export {
  getDynamicImageModels,
  registerDynamicImageModelSource,
  resetDynamicImageModelSources
};
