import { applyRiskMask, restoreRiskBlocks } from "./riskGateStep.js";
function resolveRiskGate(options) {
  const rg = options?.riskGate ?? options?.config?.riskGate;
  return rg?.enabled ? rg : void 0;
}
function attach(result, mask) {
  if (mask.blocks.length) result.body = restoreRiskBlocks(result.body, mask.blocks);
  if (result.stats) result.stats.riskGate = mask.stats;
  return result;
}
function withRiskGate(body, riskGate, run) {
  if (!riskGate) return run(body);
  const mask = applyRiskMask(body, riskGate);
  return attach(run(mask.maskedBody), mask);
}
async function withRiskGateAsync(body, riskGate, run) {
  if (!riskGate) return run(body);
  const mask = applyRiskMask(body, riskGate);
  return attach(await run(mask.maskedBody), mask);
}
export {
  resolveRiskGate,
  withRiskGate,
  withRiskGateAsync
};
