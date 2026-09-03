const ENGINES = /* @__PURE__ */ new Map();
function assertValidEngine(engine) {
  if (!engine?.id || typeof engine.apply !== "function" || typeof engine.compress !== "function" || typeof engine.getConfigSchema !== "function" || typeof engine.validateConfig !== "function") {
    throw new Error("Invalid compression engine registration");
  }
}
function registerEngine(engine, defaultConfig = {}) {
  assertValidEngine(engine);
  const validation = engine.validateConfig(defaultConfig);
  if (!validation.valid) {
    throw new Error(`Invalid default config for ${engine.id}: ${validation.errors.join("; ")}`);
  }
  ENGINES.set(engine.id, {
    engine,
    enabled: true,
    config: { ...defaultConfig }
  });
}
function registerCompressionEngine(engine) {
  registerEngine(engine);
}
function unregisterCompressionEngine(id) {
  return ENGINES.delete(id);
}
function getEngine(id) {
  return ENGINES.get(id)?.engine ?? null;
}
function getCompressionEngine(id) {
  return getEngine(id);
}
function getEngineEntry(id) {
  return ENGINES.get(id) ?? null;
}
function listEngines() {
  return Array.from(ENGINES.values());
}
function listCompressionEngines() {
  return listEngines().map((entry) => entry.engine);
}
function listEnabledEngines() {
  return listEngines().filter((entry) => entry.enabled);
}
function setEngineEnabled(id, enabled) {
  const entry = ENGINES.get(id);
  if (!entry) return false;
  entry.enabled = enabled;
  return true;
}
function updateEngineConfig(id, config) {
  const entry = ENGINES.get(id);
  if (!entry) return { valid: false, errors: [`Unknown compression engine: ${id}`] };
  const nextConfig = { ...entry.config, ...config };
  const validation = entry.engine.validateConfig(nextConfig);
  if (!validation.valid) return validation;
  entry.config = nextConfig;
  return { valid: true, errors: [] };
}
function clearCompressionEngineRegistry() {
  ENGINES.clear();
}
export {
  clearCompressionEngineRegistry,
  getCompressionEngine,
  getEngine,
  getEngineEntry,
  listCompressionEngines,
  listEnabledEngines,
  listEngines,
  registerCompressionEngine,
  registerEngine,
  setEngineEnabled,
  unregisterCompressionEngine,
  updateEngineConfig
};
