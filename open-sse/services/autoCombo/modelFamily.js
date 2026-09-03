const MODEL_FAMILIES = [
  "glm",
  "minimax",
  "mimo",
  "zai",
  "gemma",
  "llama",
  "gemini"
];
const MODEL_FAMILY_SET = new Set(MODEL_FAMILIES);
const FAMILY_ID_PATTERNS = [
  { family: "glm", pattern: /^glm-/i },
  { family: "minimax", pattern: /^minimax-/i },
  { family: "mimo", pattern: /^mimo-/i },
  { family: "gemma", pattern: /^gemma-/i },
  { family: "llama", pattern: /^llama-/i },
  { family: "gemini", pattern: /^gemini-/i }
];
const FAMILY_PROVIDER_OVERRIDE = {
  zai: "zai"
};
function isValidModelFamily(value) {
  return typeof value === "string" && MODEL_FAMILY_SET.has(value);
}
function detectModelFamily(modelId) {
  if (typeof modelId !== "string" || modelId.trim().length === 0) return null;
  const bare = modelId.includes("/") ? modelId.slice(modelId.lastIndexOf("/") + 1) : modelId;
  for (const { family, pattern } of FAMILY_ID_PATTERNS) {
    if (pattern.test(bare)) return family;
  }
  return null;
}
function buildFamilyCandidateFilter(family) {
  const providerOverride = FAMILY_PROVIDER_OVERRIDE[family];
  if (providerOverride) {
    return (candidate) => candidate.provider === providerOverride;
  }
  return (candidate) => detectModelFamily(candidate.model) === family;
}
const AUTO_FAMILY_IDS = MODEL_FAMILIES.map((family) => `auto/${family}`);
export {
  AUTO_FAMILY_IDS,
  FAMILY_PROVIDER_OVERRIDE,
  MODEL_FAMILIES,
  buildFamilyCandidateFilter,
  detectModelFamily,
  isValidModelFamily
};
