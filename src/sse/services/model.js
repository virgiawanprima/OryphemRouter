// Re-export from open-sse with localDb integration
import { getModelAliases, getComboByName, getProviderNodes } from "@/lib/localDb";
import { parseModel as parseModelCore, resolveModelAliasFromMap, getModelInfoCore } from "open-sse/services/model.js";
import { isValidModel, getProviderModels } from "open-sse/config/providerModels.js";
import REGISTRY from "open-sse/providers/registry/index.js";

// Passthrough providers accept any model id (live catalog / managed).
const PASSTHROUGH_PROVIDERS = new Set(
  REGISTRY.filter((r) => r.passthroughModels).map((r) => r.id)
);

// Providers whose catalog is fetched LIVE per account (see LIVE_MODEL_RESOLVERS
// in src/app/api/v1/models/route.js). Their static registry list is a seed only —
// models that exist only in the live catalog must not be rejected here.
const LIVE_CATALOG_PROVIDERS = new Set([
  "kiro", "qoder", "kimchi", "github", "clinepass", "grok-cli", "cursor", "zed", "opencode",
]);

// Anti-fraud runtime gate: reject model ids that are not in a known provider's
// catalog instead of silently sending garbage upstream. Skips passthrough
// providers, live-catalog providers, and custom compatible-node prefixes.
function assertModelExists(provider, model) {
  if (!provider || !model) return;
  if (PASSTHROUGH_PROVIDERS.has(provider)) return;
  if (LIVE_CATALOG_PROVIDERS.has(provider)) return;
  const known = getProviderModels(provider);
  if (known.length === 0) return; // custom node / unknown provider
  // Strip any thinking "(level)" suffix before lookup (matches getModelUpstreamId).
  const clean = String(model).replace(/\s*\([^()]+\)\s*$/, "").trim();
  if (!isValidModel(provider, clean)) {
    const err = new Error(
      `Model '${model}' is not available for provider '${provider}'. Check the model id or the provider's /models catalog.`
    );
    err.status = 400;
    err.code = "unknown_model";
    throw err;
  }
}

// Local provider alias overrides (HMR-friendly, applied on top of open-sse map)
const LOCAL_PROVIDER_ALIASES = {
  xmtp: "xiaomi-tokenplan",
  "xiaomi-tokenplan": "xiaomi-tokenplan",
};

const RESERVED_PROVIDER_PREFIXES = new Set(Object.keys(LOCAL_PROVIDER_ALIASES));
for (const entry of REGISTRY) {
  RESERVED_PROVIDER_PREFIXES.add(entry.id);
  if (entry.alias) RESERVED_PROVIDER_PREFIXES.add(entry.alias);
  for (const alias of entry.aliases || []) RESERVED_PROVIDER_PREFIXES.add(alias);
}

export function parseModel(modelStr) {
  const parsed = parseModelCore(modelStr);

  // Support short aliases (oc, kr, cu, cx, ...) by auto-resolving to canonical
  // provider IDs. These were historically accepted and are still used in persisted
  // config (combos, CLI settings, disabled models). A deprecation flag is set so
  // we can warn clients, but we DO NOT reject them.
  if (parsed?.provider && !parsed.isAlias && parsed.providerAlias && parsed.providerAlias !== parsed.provider) {
    // Auto-resolve alias → provider: parsed.provider already holds the canonical ID
    // via resolveProviderAlias in open-sse-core. Preserve the ORIGINAL alias string
    // (before resolve) so we can check if it conflicts with a user-defined node prefix.
    return {
      ...parsed,
      originalProviderAlias: parsed.providerAlias, // preserved original short alias
      deprecation: true,
    };
  }

  if (parsed?.providerAlias && LOCAL_PROVIDER_ALIASES[parsed.providerAlias]) {
    return { ...parsed, provider: LOCAL_PROVIDER_ALIASES[parsed.providerAlias] };
  }
  return parsed;
}

/**
 * Resolve model alias from localDb
 */
export async function resolveModelAlias(alias) {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Get full model info (parse or resolve)
 */
export async function getModelInfo(modelStr) {
  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    // Provider-node prefixes are user-defined. They take precedence over built-in
    // provider aliases (even reserved ones like `cf`) so users can claim common prefixes.
    // We use originalProviderAlias if present (it was a short alias); otherwise providerAlias.
    const prefix = parsed.originalProviderAlias || parsed.providerAlias;
    
    // Check ALL node types for this prefix, even if it matches a reserved built-in name.
    const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
    const matchedOpenAI = openaiNodes.find((node) => node.prefix === prefix);
    if (matchedOpenAI) return { provider: matchedOpenAI.id, model: parsed.model };

    const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
    const matchedAnthropic = anthropicNodes.find((node) => node.prefix === prefix);
    if (matchedAnthropic) return { provider: matchedAnthropic.id, model: parsed.model };

    const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
    const matchedEmbedding = embeddingNodes.find((node) => node.prefix === prefix);
    if (matchedEmbedding) return { provider: matchedEmbedding.id, model: parsed.model };

    // No matching node → treat as standard provider lookup with reserved name check
    assertModelExists(parsed.provider, parsed.model);
    return {
      provider: parsed.provider,
      model: parsed.model
    };
  }

  // Check if this is a combo name before resolving as alias
  // This prevents combo names from being incorrectly routed to providers
  const combo = await getComboByName(parsed.model);
  if (combo) {
    // Return null provider to signal this should be handled as combo
    // The caller (handleChat) will detect this and handle it as combo
    return { provider: null, model: parsed.model };
  }

  const resolved = await getModelInfoCore(modelStr, getModelAliases);
  assertModelExists(resolved.provider, resolved.model);
  return resolved;
}

/**
 * Check if model is a combo and get models list
 * @returns {Promise<string[]|null>} Array of models or null if not a combo
 */
export async function getComboModels(modelStr) {
  // Only check if it's not in provider/model format
  if (modelStr.includes("/")) return null;

  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}
