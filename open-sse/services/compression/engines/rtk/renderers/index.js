import { NO_RENDER } from "./types.js";
import { renderGitDiff } from "./gitDiff.js";
import { renderTestGreen } from "./testGreen.js";
import { renderTerraformPlan } from "./terraformPlan.js";
import { renderStructuredTable } from "./structuredTable.js";
const REGISTRY = {};
REGISTRY["git-diff"] = renderGitDiff;
REGISTRY["test-pytest"] = renderTestGreen;
REGISTRY["test-jest"] = renderTestGreen;
REGISTRY["test-vitest"] = renderTestGreen;
REGISTRY["build-eslint"] = renderTestGreen;
REGISTRY["terraform-plan"] = renderTerraformPlan;
REGISTRY["tofu-plan"] = renderTerraformPlan;
REGISTRY["aws"] = renderStructuredTable;
REGISTRY["json-output"] = renderStructuredTable;
function applyRenderer(text, detection, config) {
  const r = REGISTRY[detection.type];
  if (!r) return NO_RENDER(text);
  if (config.renderers && config.renderers.length > 0 && !config.renderers.includes(detection.type)) {
    return NO_RENDER(text);
  }
  return r(text, detection);
}
export {
  REGISTRY,
  applyRenderer
};
