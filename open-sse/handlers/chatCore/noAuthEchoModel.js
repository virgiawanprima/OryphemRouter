import { REGISTRY } from "../../config/providerRegistry.js";
import { isNoAuthProviderKey } from "../../utils/omni/noAuthProviders.js";
function resolveNoAuthEchoModel(requestedModel, provider) {
  if (typeof requestedModel !== "string" || !requestedModel) return null;
  if (requestedModel.includes("/")) return null;
  if (!isNoAuthProviderKey(provider)) return null;
  const alias = provider && REGISTRY[provider]?.alias || provider;
  return `${alias}/${requestedModel}`;
}
export {
  resolveNoAuthEchoModel
};
