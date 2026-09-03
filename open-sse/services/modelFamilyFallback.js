import { getModelContextLimit } from "../utils/omni/modelCapabilitiesFull.js";
import { parseModel } from "./model.js";
import {
  CONTEXT_OVERFLOW_REGEX,
  containsModelUnavailableMessage,
  isResourceNotFoundResponse
} from "./errorClassifier.js";
import { getRegistryEntry } from "../config/providerRegistry.js";
import { isModelSelectable } from "./modelLifecycle.js";
const FAMILY_FALLBACK_TEMPLATES = {
  // Gemini 3 / 3.1 Pro family — ordered by preference
  "gemini-3-pro": [
    "gemini-3.1-pro-preview",
    "gemini-3-pro-preview",
    "gemini-3.1-pro-high",
    "gemini-3-pro-high",
    "gemini-3.1-pro-low",
    "gemini-3-pro-low"
  ],
  "gemini-3.1-pro": [
    "gemini-3.1-pro-preview",
    "gemini-3-pro-preview",
    "gemini-3.1-pro-high",
    "gemini-3-pro-high",
    "gemini-3.1-pro-low",
    "gemini-3-pro-low"
  ],
  "gemini-3-pro-preview": [
    "gemini-3.1-pro-preview",
    "gemini-3-pro-high",
    "gemini-3.1-pro-high",
    "gemini-3-pro-low",
    "gemini-3.1-pro-low"
  ],
  "gemini-3.1-pro-preview": [
    "gemini-3-pro-preview",
    "gemini-3.1-pro-high",
    "gemini-3-pro-high",
    "gemini-3.1-pro-low",
    "gemini-3-pro-low"
  ],
  "gemini-3-pro-high": [
    "gemini-3.1-pro-high",
    "gemini-3-pro-preview",
    "gemini-3.1-pro-preview",
    "gemini-3-pro-low",
    "gemini-3.1-pro-low"
  ],
  "gemini-3.1-pro-high": [
    "gemini-3-pro-high",
    "gemini-3.1-pro-preview",
    "gemini-3-pro-preview",
    "gemini-3.1-pro-low",
    "gemini-3-pro-low"
  ],
  // Gemini 2.5 Pro family
  "gemini-2.5-pro": ["gemini-2.5-pro-preview-06-05", "gemini-2.5-pro-exp-03-25"],
  "gemini-2.5-pro-preview-06-05": ["gemini-2.5-pro", "gemini-2.5-pro-exp-03-25"],
  // Claude Mythos family (Fable 5) — flagship falls to the next-best Opus
  // tiers before the cheaper Sonnet, matching the Opus family ordering.
  "claude-fable-5": ["claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5"],
  // Claude Opus family
  "claude-opus-5": ["claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5"],
  "claude-opus-4-8": ["claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-5"],
  "claude-opus-4-7": ["claude-opus-4-6", "claude-opus-4-5-20251101", "claude-sonnet-5"],
  "claude-opus-4-6": ["claude-opus-4-6-thinking", "claude-opus-4-5-20251101", "claude-sonnet-5"],
  "claude-opus-4-6-thinking": ["claude-opus-4-6", "claude-opus-4-5-20251101"],
  // Claude Sonnet family — Sonnet 5 is the newest tier; degrade to 4.6 → 4.5 → 4.
  "claude-sonnet-5": [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514"
  ],
  "claude-sonnet-4-6": ["claude-sonnet-4-5-20250929", "claude-sonnet-4-20250514"],
  "claude-sonnet-4-5-20250929": ["claude-sonnet-4-6", "claude-sonnet-4-20250514"]
};
const MODEL_UNAVAILABLE_FRAGMENTS = [
  "model not found",
  "model_not_found",
  "model not available",
  "model is not available",
  "no such model",
  "unsupported model",
  "unknown model",
  "this model does not exist",
  "invalid model",
  "model not supported",
  "not enabled for",
  "access to model"
];
function isModelUnavailableError(status, errorMessage, provider) {
  if (status === 404) return !isResourceNotFoundResponse(errorMessage);
  if (status !== 400 && status !== 403) return false;
  const msg = errorMessage.toLowerCase();
  if (provider === "kiro" && msg.includes("improperly formed request")) return true;
  if (MODEL_UNAVAILABLE_FRAGMENTS.some((fragment) => msg.includes(fragment))) return true;
  return containsModelUnavailableMessage(errorMessage);
}
function isContextOverflowError(status, errorMessage) {
  if (status !== 400) return false;
  return CONTEXT_OVERFLOW_REGEX.test(errorMessage);
}
function candidateNotationVariants(candidate) {
  const variants = [
    candidate,
    candidate.replace(/-(\d+)-(\d+)$/, "-$1.$2"),
    candidate.replace(/-(\d+)-(\d+)-/, "-$1.$2-")
  ];
  const dateStripped = candidate.replace(/-\d{8}$/, "");
  if (dateStripped !== candidate) {
    variants.push(dateStripped, dateStripped.replace(/-(\d+)-(\d+)$/, "-$1.$2"));
  }
  return variants;
}
function resolveCandidateNotation(candidate, supportedIds) {
  return candidateNotationVariants(candidate).find((variant) => supportedIds.has(variant)) ?? null;
}
function resolveFamilyContext(currentModel, providerHint) {
  const parsed = parseModel(currentModel);
  const bareModel = parsed.model || currentModel;
  const explicitProvider = parsed.provider || parsed.providerAlias || null;
  const registryEntry = getRegistryEntry(explicitProvider || providerHint || "");
  if (!registryEntry) return null;
  const lookupKey = bareModel.replace(/\./g, "-");
  const family = FAMILY_FALLBACK_TEMPLATES[lookupKey] ?? FAMILY_FALLBACK_TEMPLATES[bareModel] ?? null;
  if (!family) return null;
  return {
    bareModel,
    family,
    provider: registryEntry.id,
    outputPrefix: explicitProvider ? `${registryEntry.id}/` : "",
    supportedIds: new Set(registryEntry.models.map((model) => model.id))
  };
}
function wasCandidateTried(candidateModel, provider, triedModels) {
  for (const attempted of triedModels) {
    const parsed = parseModel(attempted);
    const attemptedModel = parsed.model || attempted;
    const attemptedProvider = parsed.provider || parsed.providerAlias || provider;
    const registryEntry = getRegistryEntry(attemptedProvider);
    if ((registryEntry?.id || attemptedProvider) === provider && attemptedModel === candidateModel) {
      return true;
    }
  }
  return false;
}
function resolveProviderFamilyCandidates(currentModel, providerHint) {
  const context = resolveFamilyContext(currentModel, providerHint);
  if (!context) return null;
  const candidates = [];
  for (const candidate of context.family) {
    const resolvedCandidate = resolveCandidateNotation(candidate, context.supportedIds);
    if (!resolvedCandidate) continue;
    if (!isModelSelectable(context.provider, resolvedCandidate)) continue;
    if (!candidates.includes(resolvedCandidate)) candidates.push(resolvedCandidate);
  }
  return {
    provider: context.provider,
    outputPrefix: context.outputPrefix,
    candidates
  };
}
function getNextFamilyFallback(currentModel, triedModels, providerHint) {
  const resolved = resolveProviderFamilyCandidates(currentModel, providerHint);
  if (!resolved) return null;
  for (const candidate of resolved.candidates) {
    if (!wasCandidateTried(candidate, resolved.provider, triedModels)) {
      return `${resolved.outputPrefix}${candidate}`;
    }
  }
  return null;
}
function isInModelFamily(model, providerHint) {
  const resolved = resolveProviderFamilyCandidates(model, providerHint);
  return Boolean(resolved?.candidates.length);
}
function getModelFamily(model, providerHint) {
  const resolved = resolveProviderFamilyCandidates(model, providerHint);
  if (!resolved) return [model];
  return [model, ...resolved.candidates.map((candidate) => `${resolved.outputPrefix}${candidate}`)];
}
function findLargerContextModel(currentModel, availableModels, providerHint) {
  const currentParsed = parseModel(currentModel);
  const currentProvider = currentParsed.provider || currentParsed.providerAlias || providerHint || "unknown";
  const currentModelId = currentParsed.model || currentModel;
  const currentLimit = getModelContextLimit(currentProvider, currentModelId) ?? 0;
  let bestModel = null;
  let bestLimit = currentLimit;
  for (const candidate of availableModels) {
    if (candidate === currentModel) continue;
    const parsed = parseModel(candidate);
    const provider = parsed.provider || parsed.providerAlias || providerHint || "unknown";
    const modelId = parsed.model || candidate;
    const limit = getModelContextLimit(provider, modelId) ?? 0;
    if (limit > bestLimit) {
      bestLimit = limit;
      bestModel = candidate;
    }
  }
  return bestModel;
}
export {
  findLargerContextModel,
  getModelFamily,
  getNextFamilyFallback,
  isContextOverflowError,
  isInModelFamily,
  isModelUnavailableError
};
