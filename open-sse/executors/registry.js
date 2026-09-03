const registry = /* @__PURE__ */ new Map();
function registerExecutor(alias, executor) {
  if (registry.has(alias)) {
    throw new Error(`executor alias already registered: "${alias}"`);
  }
  registry.set(alias, executor);
}
function getRegisteredExecutor(alias) {
  return registry.get(alias);
}
function hasRegisteredExecutor(alias) {
  return registry.has(alias);
}
function listExecutorAliases() {
  return [...registry.keys()];
}
export {
  getRegisteredExecutor,
  hasRegisteredExecutor,
  listExecutorAliases,
  registerExecutor
};
