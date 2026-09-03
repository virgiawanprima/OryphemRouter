/**
 * unified by integration — canonical definitions live in ./providerRegistry.js.
 * providerRegistryStub.js was a parallel port that returned an empty REGISTRY and
 * a null-returning getRegistryEntry. It now re-exports the unified facade backed
 * by the real provider registry, so `getRegistryEntry` (used by
 * handlers/chatCore/targetFormat.js) resolves actual entries; callers such as
 * resolveAlternateFormat treat missing metadata gracefully.
 */
import { REGISTRY, getRegistryEntry } from "./providerRegistry.js";
export { REGISTRY, getRegistryEntry } from "./providerRegistry.js";
export default { REGISTRY, getRegistryEntry };
