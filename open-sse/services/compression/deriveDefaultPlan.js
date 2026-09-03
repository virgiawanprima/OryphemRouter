import { ENGINE_CATALOG, engineMeta } from "./engineCatalog.js";
const SINGLE_MODE_OF = {
  lite: "lite",
  caveman: "standard",
  aggressive: "aggressive",
  ultra: "ultra",
  rtk: "rtk",
  "codex-responses": "codex-responses",
  omniglyph: "omniglyph"
};
function deriveDefaultPlan(engines, masterEnabled) {
  if (!masterEnabled) return { mode: "off", stackedPipeline: [] };
  const onIds = Object.keys(ENGINE_CATALOG).filter((id) => engines[id]?.enabled === true);
  if (onIds.length === 0) return { mode: "off", stackedPipeline: [] };
  if (onIds.length === 1 && engineMeta(onIds[0]).isSingleMode) {
    return { mode: SINGLE_MODE_OF[onIds[0]], stackedPipeline: [] };
  }
  const ordered = onIds.sort((a, b) => engineMeta(a).stackPriority - engineMeta(b).stackPriority);
  const stackedPipeline = ordered.map((id) => {
    const level = engines[id]?.level;
    return level ? { engine: id, intensity: level } : { engine: id };
  });
  return { mode: "stacked", stackedPipeline };
}
export {
  deriveDefaultPlan
};
