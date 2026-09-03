function hasActiveClaudeThinking(body) {
  const thinking = body.thinking;
  return thinking?.type === "enabled" || thinking?.type === "adaptive";
}
function collectThinkingConfigs(body) {
  if (!body || typeof body !== "object") return [];
  const root = body;
  const configs = [];
  const envelopes = [
    root.generationConfig,
    root.request?.generationConfig
  ];
  for (const env of envelopes) {
    if (!env || typeof env !== "object") continue;
    const tc = env.thinkingConfig;
    if (tc && typeof tc === "object") {
      const tcr = tc;
      if ("thinkingBudget" in tcr || "thinking_budget" in tcr) configs.push(tcr);
    }
  }
  return configs;
}
function readNestedThinkingBudget(body) {
  for (const tc of collectThinkingConfigs(body)) {
    const raw = tc.thinkingBudget ?? tc.thinking_budget;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function clampNestedThinkingBudget(body, max) {
  let changed = false;
  for (const tc of collectThinkingConfigs(body)) {
    for (const key of ["thinkingBudget", "thinking_budget"]) {
      const n = Number(tc[key]);
      if (Number.isFinite(n) && n > max) {
        tc[key] = max;
        changed = true;
      }
    }
  }
  return changed;
}
export {
  clampNestedThinkingBudget,
  collectThinkingConfigs,
  hasActiveClaudeThinking,
  readNestedThinkingBudget
};
