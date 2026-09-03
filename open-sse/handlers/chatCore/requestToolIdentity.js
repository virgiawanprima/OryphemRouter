function toToolNameAliasMap(map) {
  if (!map || map.size === 0) return null;
  const aliases = /* @__PURE__ */ new Map();
  for (const [wireName, originalName] of map) {
    if (typeof originalName !== "string") return null;
    aliases.set(wireName, originalName);
  }
  return aliases;
}
function extractRequestToolIdentityMap(translatedBody) {
  const namespaceIdentityMap = translatedBody._namespaceToolIdentityMap;
  const requestToolIdentityMap = namespaceIdentityMap instanceof Map ? namespaceIdentityMap : translatedBody._toolNameMap instanceof Map ? translatedBody._toolNameMap : null;
  delete translatedBody._namespaceToolIdentityMap;
  delete translatedBody._toolNameMap;
  return requestToolIdentityMap;
}
export {
  extractRequestToolIdentityMap,
  toToolNameAliasMap
};
