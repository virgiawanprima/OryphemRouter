import { VALID_VARIANTS } from "./autoPrefix.js";
import { parseAutoSuffix } from "./suffixComposition.js";
import { isValidModelFamily, AUTO_FAMILY_IDS } from "./modelFamily.js";
const VALID_AUTO_VARIANTS = new Set(VALID_VARIANTS);
const AUTO_TEMPLATE_VARIANTS = {
  "auto/best-coding": "coding",
  "auto/best-reasoning": "smart",
  "auto/best-fast": "fast",
  "auto/best-vision": "smart",
  "auto/best-chat": void 0,
  "auto/best-coding-fast": "fast",
  "auto/pro-coding": "coding",
  "auto/pro-reasoning": "smart",
  "auto/pro-vision": "smart",
  "auto/pro-chat": void 0,
  "auto/pro-fast": "fast",
  "auto/coding": "coding",
  "auto/fast": "fast",
  "auto/chat": void 0,
  // #4235 Phase A: these are valid variants (parseAutoPrefix accepts them) and
  // the README advertises them, but they were missing from this catalog so
  // `/v1/models` + the dashboard never listed them. Surface them explicitly.
  "auto/cheap": "cheap",
  "auto/offline": "offline",
  "auto/smart": "smart",
  "auto/claude-opus": "smart",
  "auto/claude-sonnet": "coding",
  "auto/best-free": "cheap",
  // Chaos mode — parallel dispatch to top-N stable models
  "auto/best-chaos": "chaos",
  "auto/chaos": "chaos"
};
const AUTO_SUFFIX_VARIANTS = [
  "auto/coding:fast",
  "auto/coding:cheap",
  "auto/coding:free",
  "auto/coding:pro",
  "auto/coding:reliable",
  "auto/reasoning",
  "auto/reasoning:pro",
  "auto/vision",
  "auto/multimodal"
];
function resolveAutoVariant(modelStr, suffix) {
  if (Object.prototype.hasOwnProperty.call(AUTO_TEMPLATE_VARIANTS, modelStr)) {
    return { recognized: true, variant: AUTO_TEMPLATE_VARIANTS[modelStr] };
  }
  if (VALID_AUTO_VARIANTS.has(suffix)) {
    return { recognized: true, variant: suffix };
  }
  return { recognized: false };
}
function isRecognizedBuiltinAuto(modelStr, suffix) {
  return resolveAutoVariant(modelStr, suffix).recognized || parseAutoSuffix(suffix).valid || isValidModelFamily(suffix);
}
function isPaidTierAutoId(autoId) {
  if (typeof autoId !== "string" || !autoId.startsWith("auto/")) return false;
  const suffix = autoId.slice("auto/".length);
  if (suffix.startsWith("pro-")) return true;
  const parsed = parseAutoSuffix(suffix);
  return parsed.valid && parsed.tier === "pro";
}
const VISION_CATEGORY_AUTO_IDS = {
  "auto/best-vision": { category: "vision" },
  "auto/pro-vision": { category: "vision", tier: "pro" }
};
function resolveBuiltinAutoSpec(modelStr, suffix) {
  const visionSpec = VISION_CATEGORY_AUTO_IDS[modelStr];
  if (visionSpec) return visionSpec;
  const resolved = resolveAutoVariant(modelStr, suffix);
  if (resolved.recognized) {
    return { variant: resolved.variant };
  }
  const parsed = parseAutoSuffix(suffix);
  if (parsed.valid) {
    return {
      category: parsed.category,
      ...parsed.tier ? { tier: parsed.tier } : {}
    };
  }
  return { variant: void 0 };
}
async function prepareBuiltinAutoComboInputs(resolutionSnapshot) {
  const { prepareVirtualAutoComboInputs } = await import("./virtualFactory.js");
  return prepareVirtualAutoComboInputs({
    includeResolvedCapabilities: true,
    resolutionSnapshot
  });
}
async function createBuiltinAutoCombo(modelStr, suffix, prepared) {
  const { createVirtualAutoCombo, createVirtualAutoComboFromPrepared } = await import("./virtualFactory.js");
  const materialize = (variant, spec2) => prepared ? createVirtualAutoComboFromPrepared(prepared, variant, spec2) : createVirtualAutoCombo(variant, spec2);
  const spec = resolveBuiltinAutoSpec(modelStr, suffix);
  if ("category" in spec) {
    const virtualCombo = await materialize(void 0, {
      category: spec.category,
      ...spec.tier ? { tier: spec.tier } : {}
    });
    virtualCombo.name = modelStr;
    virtualCombo.id = modelStr;
    return virtualCombo;
  }
  if ("variant" in spec && spec.variant !== void 0) {
    const virtualCombo = await materialize(spec.variant, {
      ...modelStr === "auto/best-free" ? { tier: "free" } : {}
    });
    virtualCombo.name = modelStr;
    virtualCombo.id = modelStr;
    return virtualCombo;
  }
  if (Object.prototype.hasOwnProperty.call(AUTO_TEMPLATE_VARIANTS, modelStr)) {
    const virtualCombo = await materialize(void 0);
    virtualCombo.name = modelStr;
    virtualCombo.id = modelStr;
    return virtualCombo;
  }
  const parsed = parseAutoSuffix(suffix);
  if (parsed.valid) {
    const virtualCombo = await materialize(void 0, {
      category: parsed.category,
      tier: parsed.tier
    });
    virtualCombo.name = modelStr;
    virtualCombo.id = modelStr;
    return virtualCombo;
  }
  if (isValidModelFamily(suffix)) {
    const virtualCombo = await materialize(void 0, { family: suffix });
    virtualCombo.name = modelStr;
    virtualCombo.id = modelStr;
    return virtualCombo;
  }
  throw new Error(`Unknown built-in auto combo: ${modelStr}`);
}
export {
  AUTO_FAMILY_IDS,
  AUTO_SUFFIX_VARIANTS,
  AUTO_TEMPLATE_VARIANTS,
  VALID_AUTO_VARIANTS,
  createBuiltinAutoCombo,
  isPaidTierAutoId,
  isRecognizedBuiltinAuto,
  prepareBuiltinAutoComboInputs,
  resolveAutoVariant,
  resolveBuiltinAutoSpec
};
