import {
  clampConolEffort,
  conolEffortsForModel
} from "./conolModels.js";
const CONOL_ORIGIN = "https://conol.ai";
const CONOL_DEFAULT_MODEL_PRESET = "pro";
const KNOWN_PRESETS = /* @__PURE__ */ new Set(["flash", "moderate", "pro", "ultra"]);
function isConolModelPreset(value) {
  return KNOWN_PRESETS.has(value);
}
function buildConolSessionModelPlan(options) {
  const supported = conolEffortsForModel(options.model, options.catalog);
  const effort = clampConolEffort(options.effort, supported);
  return {
    preset: {
      modelPreset: options.modelPreset || CONOL_DEFAULT_MODEL_PRESET,
      hasImageHistory: options.hasImageHistory
    },
    model: { agentModel: options.model, agentEffort: null },
    effort: effort ? { agentEffort: effort } : null
  };
}
function conolSessionModelUrl(sessionId) {
  return `${CONOL_ORIGIN}/api/sessions/${encodeURIComponent(sessionId)}/model`;
}
async function postSessionModel(url, body, options) {
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { ...options.buildHeaders(options.sessionId), "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal ?? void 0
  });
  await response.body?.cancel().catch(() => void 0);
  if (!response.ok) {
    options.onWarning?.(
      `Conol session model update failed (HTTP ${response.status}) for ${JSON.stringify(body)}`
    );
    return false;
  }
  return true;
}
async function applyConolSessionModel(options) {
  const url = conolSessionModelUrl(options.sessionId);
  const applied = {
    presetApplied: false,
    modelApplied: false,
    effortApplied: null
  };
  if (!options.skipPreset) {
    applied.presetApplied = await postSessionModel(url, options.plan.preset, options);
  }
  applied.modelApplied = await postSessionModel(url, options.plan.model, options);
  if (applied.modelApplied && options.plan.effort) {
    const ok = await postSessionModel(url, options.plan.effort, options);
    if (ok) applied.effortApplied = options.plan.effort.agentEffort;
  }
  return applied;
}
export {
  CONOL_DEFAULT_MODEL_PRESET,
  CONOL_ORIGIN,
  applyConolSessionModel,
  buildConolSessionModelPlan,
  conolSessionModelUrl,
  isConolModelPreset
};
