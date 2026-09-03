import { SEARCH_PROVIDERS } from "../../config/searchRegistry.js";
import { isProviderBlockedByIdOrAlias } from "../../utils/omni/noAuthProviders.js";
function getActiveSearchProviders(blockedProviders = []) {
  const activeProviders = Object.values(SEARCH_PROVIDERS).filter(
    (provider) => !provider.disabled && !isProviderBlockedByIdOrAlias(provider.id, blockedProviders)
  ).map((provider) => provider.id);
  if (activeProviders.length === 0) {
    return ["none_available"];
  }
  return activeProviders;
}
export {
  getActiveSearchProviders
};
