import { deriveDefaultPlan } from "./deriveDefaultPlan.js";
function resolveCompressionPlan(config, ctx) {
  if (config?.enabled === false) return { mode: "off", stackedPipeline: [] };
  const ov = ctx.comboId ? config?.comboOverrides?.[ctx.comboId] : void 0;
  if (ov) return modeToPlan(ov, config);
  if (config?.activeComboId && ctx.combos?.[config.activeComboId]) {
    return { mode: "stacked", stackedPipeline: ctx.combos[config.activeComboId] };
  }
  return deriveDefaultPlan(config?.engines ?? {}, config?.enabled !== false);
}
function modeToPlan(mode, config) {
  return mode === "stacked" ? { mode: "stacked", stackedPipeline: config?.stackedPipeline ?? [] } : { mode, stackedPipeline: [] };
}
export {
  resolveCompressionPlan
};
