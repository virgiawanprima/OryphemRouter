// Minimal self-contained adaptation of OmniRoute's @/lib/modelCapabilities
// (DB-backed) for OryphemRouter.
//
// unified by integration — modelCapabilities.js is the capability/output-cap
// facade of the modelCapabilities/modelSpecs cluster; getExplicitModelOutputCap
// is consumed by executors/antigravityOutputCap.js, and getModelSpec is
// re-exported from the unified ./modelSpecs.js so the cluster resolves both
// `getModelSpec` and `getExplicitModelOutputCap`. Returns a graceful fallback
// instead of querying the app database, which does not exist in this project.

export { getModelSpec } from "./modelSpecs.js";

/**
 * Return the declared max output tokens for a model, or undefined when the
 * model is unknown to the local catalogue (OryphemRouter has no model DB).
 */
export function getExplicitModelOutputCap(_opts) {
  return undefined;
}
