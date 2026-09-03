const CC_DISCOVERY_PREFIX = "claude/";
const CC_DISCOVERY_COMBO_PREFIX = "combo/";
function stripCcDiscoveryAlias(model, deps) {
  if (typeof model !== "string" || !model.startsWith(CC_DISCOVERY_PREFIX)) {
    return { model, stripped: false };
  }
  const rest = model.slice(CC_DISCOVERY_PREFIX.length);
  if (deps.isClaudeProviderModel(rest)) {
    return { model, stripped: false };
  }
  if (rest.startsWith(CC_DISCOVERY_COMBO_PREFIX)) {
    const comboName = rest.slice(CC_DISCOVERY_COMBO_PREFIX.length);
    if (deps.hasCombo(comboName) && deps.aliasEnabledFor(rest)) {
      return { model: comboName, stripped: true };
    }
    return { model, stripped: false };
  }
  const slashIndex = rest.indexOf("/");
  if (slashIndex > 0 && deps.isKnownProviderPrefix(rest.slice(0, slashIndex)) && deps.aliasEnabledFor(rest)) {
    return { model: rest, stripped: true };
  }
  return { model, stripped: false };
}
export {
  stripCcDiscoveryAlias
};
