import { checkKeyModelAccess, getKeyGroupsForApiKey } from "../utils/omni/localDbKeys.js";
function authorizeKeyModelAccess(apiKeyId, model, provider) {
  if (!apiKeyId) {
    return { authorized: true, groups: [] };
  }
  const groups = getKeyGroupsForApiKey(apiKeyId);
  if (groups.length === 0) {
    return { authorized: true, groups: [] };
  }
  const accessCheck = checkKeyModelAccess(apiKeyId, model, provider);
  if (accessCheck.allowed) {
    return {
      authorized: true,
      groups: groups.map((g) => ({ id: g.id, name: g.name }))
    };
  }
  const denyReason = accessCheck.deniedBy ? `Model "${model}" is denied by group permission (pattern: ${accessCheck.deniedBy.modelPattern})` : `Model "${model}" is not in the allowed models for your API key group(s). Configure group permissions or contact your administrator.`;
  return {
    authorized: false,
    reason: denyReason,
    groups: groups.map((g) => ({ id: g.id, name: g.name }))
  };
}
function getKeyGroupSummary(apiKeyId) {
  const groups = getKeyGroupsForApiKey(apiKeyId);
  return {
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    restricted: groups.length > 0
  };
}
export {
  authorizeKeyModelAccess,
  getKeyGroupSummary
};
