import { z } from "zod";
import { NOAUTH_PROVIDERS } from "../utils/omni/providers.js";
const providerTierOverrideSchema = z.object({
  provider: z.string().min(1),
  tier: z.enum(["free", "cheap", "premium"])
});
const modelTierOverrideSchema = z.object({
  provider: z.string().min(1),
  modelPattern: z.string().min(1),
  tier: z.enum(["free", "cheap", "premium"])
});
const tierConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  defaults: z.object({
    freeThreshold: z.number().min(0).default(0),
    cheapThreshold: z.number().min(0).default(1)
  }),
  providerOverrides: z.array(providerTierOverrideSchema).default([]),
  modelOverrides: z.array(modelTierOverrideSchema).default([]),
  freeProviders: z.array(z.string()).default([])
});
const LEGACY_FREE_PROVIDERS = [
  "kiro",
  "qoder",
  "pollinations",
  "longcat",
  "cloudflare-ai",
  "nvidia-nim",
  "cerebras",
  "groq"
];
function deriveNoAuthFreeProviders() {
  try {
    const ids = [];
    for (const def of Object.values(NOAUTH_PROVIDERS)) {
      if (!def || typeof def !== "object") continue;
      if (def.noAuth !== true) continue;
      const kinds = def.serviceKinds;
      const isLlm = !Array.isArray(kinds) || kinds.length === 0 || kinds.includes("llm");
      if (!isLlm) continue;
      if (typeof def.id === "string" && def.id.length > 0) {
        ids.push(def.id);
      }
    }
    return ids;
  } catch {
    return [];
  }
}
const NOAUTH_FREE_PROVIDERS = deriveNoAuthFreeProviders();
const DEFAULT_TIER_CONFIG = {
  version: "1.0.0",
  defaults: {
    freeThreshold: 0,
    cheapThreshold: 1
  },
  providerOverrides: [],
  modelOverrides: [],
  freeProviders: [.../* @__PURE__ */ new Set([...LEGACY_FREE_PROVIDERS, ...NOAUTH_FREE_PROVIDERS])]
};
function validateTierConfig(raw) {
  return tierConfigSchema.parse(raw);
}
function mergeTierConfig(userConfig) {
  if (!userConfig) return DEFAULT_TIER_CONFIG;
  return {
    ...DEFAULT_TIER_CONFIG,
    ...userConfig,
    defaults: {
      ...DEFAULT_TIER_CONFIG.defaults,
      ...userConfig.defaults
    },
    providerOverrides: [
      ...DEFAULT_TIER_CONFIG.providerOverrides,
      ...userConfig.providerOverrides || []
    ],
    modelOverrides: [...DEFAULT_TIER_CONFIG.modelOverrides, ...userConfig.modelOverrides || []],
    freeProviders: [
      .../* @__PURE__ */ new Set([...DEFAULT_TIER_CONFIG.freeProviders, ...userConfig.freeProviders || []])
    ]
  };
}
export {
  DEFAULT_TIER_CONFIG,
  LEGACY_FREE_PROVIDERS,
  deriveNoAuthFreeProviders,
  mergeTierConfig,
  modelTierOverrideSchema,
  providerTierOverrideSchema,
  tierConfigSchema,
  validateTierConfig
};
