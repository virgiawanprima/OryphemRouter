// unified by integration — canonical definitions live in ./providerRegistry.js
// (omniProviderRegistry.js was a parallel port of OmniRoute's
// config/providerRegistry.ts REGISTRY + getProviderCategory; now re-exports the
// unified facade backed by the real provider registry).
export { REGISTRY, getProviderCategory } from "./providerRegistry.js";
