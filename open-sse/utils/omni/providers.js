// unified by integration — canonical definitions live in ./providerRegistry.js
// (providers.js was a parallel port of OmniRoute src/shared/constants/providers.ts;
// now re-exports the unified facade so getProviderById / getProviderAlias /
// NOAUTH_PROVIDERS / APIKEY_PROVIDERS / WEB_COOKIE_PROVIDERS / AI_PROVIDERS all
// resolve from the same real provider registry).
export {
  getProviderById,
  getProviderAlias,
  NOAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  AI_PROVIDERS,
} from "./providerRegistry.js";
