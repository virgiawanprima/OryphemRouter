const FUNCTIONAL_GATEWAY_MIRROR_SUFFIX = " (via ";
const FUNCTIONAL_GATEWAY_MIRROR = Symbol("functionalGatewayMirror");
function isFunctionalGatewayMirror(model) {
  return model?.[FUNCTIONAL_GATEWAY_MIRROR] === true;
}
function appendFunctionalGatewayMirrors(models, deps) {
  if (!Array.isArray(models)) return models;
  const aliases = [];
  for (const model of models) {
    const id = model.id;
    if (typeof id !== "string" || id.length === 0) continue;
    const slashIndex = id.indexOf("/");
    if (slashIndex <= 0) continue;
    const owner = id.slice(0, slashIndex);
    const modelId = id.slice(slashIndex + 1);
    if (!modelId || modelId === id) continue;
    if (deps.canonicalOwnerHasConnection(owner)) continue;
    let chosenAlias = null;
    let chosenProvider = null;
    for (const gatewayProvider of deps.gatewayProviderIds) {
      const alias = deps.gatewayAlias(gatewayProvider);
      if (!alias || alias === owner) continue;
      if (!deps.isGateway(gatewayProvider)) continue;
      if (!deps.gatewayHasConnection(gatewayProvider)) continue;
      if (!deps.gatewayCovers(gatewayProvider, modelId)) continue;
      chosenAlias = alias;
      chosenProvider = gatewayProvider;
      break;
    }
    if (!chosenAlias || !chosenProvider) continue;
    const aliasId = `${chosenAlias}/${id}`;
    if (models.some((m) => m.id === aliasId)) continue;
    if (id.startsWith(`${chosenAlias}/`)) continue;
    const label = typeof model.name === "string" && model.name ? model.name : modelId;
    aliases.push({
      ...model,
      id: aliasId,
      root: id,
      owned_by: chosenProvider,
      display_name: `${label}${FUNCTIONAL_GATEWAY_MIRROR_SUFFIX}${chosenProvider})`,
      [FUNCTIONAL_GATEWAY_MIRROR]: true
    });
  }
  return aliases.length > 0 ? [...models, ...aliases] : models;
}
export {
  FUNCTIONAL_GATEWAY_MIRROR_SUFFIX,
  appendFunctionalGatewayMirrors,
  isFunctionalGatewayMirror
};
