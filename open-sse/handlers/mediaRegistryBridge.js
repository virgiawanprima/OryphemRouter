/**
 * mediaRegistryBridge.js
 * -----------------------------------------------------------------------------
 * Unified accessor bridge over the ported OmniRoute media-config registries
 * (open-sse/config/*Registry.js). These registries are standalone and NOT yet
 * consumed by OryphemRouter's media pipeline (which reads PROVIDER_MEDIA built
 * from legacy `media` fields in open-sse/providers/index.js) — this bridge gives
 * the engine a single, stable accessor API over the ported data.
 *
 * Two API surfaces share this module:
 *
 *  A) Unified media-pipeline accessors (async, engine-safe, no React/browser deps):
 *       getMediaProvider(kind, providerId)  -> provider config object | null
 *       listMediaProviders(kind)            -> string[] of provider ids
 *       hasMediaProvider(kind, providerId)  -> boolean
 *       getMediaRegistry(kind)              -> raw registry (map, or merged audio maps)
 *       getMediaRegistryStatus()            -> { kind: 'ok' | 'degraded' | 'missing' }
 *     Kinds: image, video, upscale, music, audio, ocr, rerank, moderation
 *     (bonus granular audio sub-kinds: audio-speech, audio-transcription,
 *      audio-translation)
 *
 *  B) Dashboard listing helpers (synchronous; kept for backward compatibility
 *     with src/app/api/media-providers/registry/route.js):
 *       KIND_REGISTRIES, getRegistryProviders(kind),
 *       getAllRegistryProviders(), humanizeProviderId(id), toProviderItem(...)
 *
 * Graceful degradation:
 *  - image / video / audio are imported LAZILY inside try/catch — a missing or
 *    broken registry degrades to empty + a warning, never a crash.
 *  - upscale / music / ocr / rerank / moderation are imported statically so the
 *    synchronous dashboard helpers keep working; every access is defensively
 *    guarded so a missing export degrades to empty as well.
 * -----------------------------------------------------------------------------
 */
import { UPSCALE_PROVIDERS } from "../config/upscaleRegistry.js";
import { MUSIC_PROVIDERS } from "../config/musicRegistry.js";
import { OCR_PROVIDERS } from "../config/ocrRegistry.js";
import { RERANK_PROVIDERS } from "../config/rerankRegistry.js";
import { MODERATION_PROVIDERS } from "../config/moderationRegistry.js";
import { IMAGE_PROVIDERS, getImageProvider } from "../config/imageRegistry.js";
import { VIDEO_PROVIDERS, getVideoProvider } from "../config/videoRegistry.js";
import { AUDIO_SPEECH_PROVIDERS, AUDIO_TRANSCRIPTION_PROVIDERS, AUDIO_TRANSLATION_PROVIDERS, getSpeechProvider, getTranscriptionProvider, getTranslationProvider } from "../config/audioRegistry.js";
import { log } from "../utils/log.js";

/* ----------------------------------------------------------------------------
 * Kind definitions
 * -------------------------------------------------------------------------- */

/**
 * Primary kinds -> how to read the registry.
 *  - module: statically-imported registry module (sync dashboard kinds).
 *  - audio:  the audio registry is composed of three provider maps.
 */
const KIND_DEFS = {
  // Static kinds (synchronous dashboard compatibility).
  image: { module: { IMAGE_PROVIDERS, getImageProvider }, mapKey: "IMAGE_PROVIDERS", getterKey: "getImageProvider" },
  video: { module: { VIDEO_PROVIDERS, getVideoProvider }, mapKey: "VIDEO_PROVIDERS", getterKey: "getVideoProvider" },
  audio: { audio: true, module: { AUDIO_SPEECH_PROVIDERS, AUDIO_TRANSCRIPTION_PROVIDERS, AUDIO_TRANSLATION_PROVIDERS, getSpeechProvider, getTranscriptionProvider, getTranslationProvider } },
  upscale: { module: { UPSCALE_PROVIDERS }, mapKey: "UPSCALE_PROVIDERS", getterKey: "getUpscaleProvider" },
  music: { module: { MUSIC_PROVIDERS }, mapKey: "MUSIC_PROVIDERS", getterKey: "getMusicProvider" },
  ocr: { module: { OCR_PROVIDERS }, mapKey: "OCR_PROVIDERS", getterKey: "getOcrProvider" },
  rerank: { module: { RERANK_PROVIDERS }, mapKey: "RERANK_PROVIDERS", getterKey: "getRerankProvider" },
  moderation: { module: { MODERATION_PROVIDERS }, mapKey: "MODERATION_PROVIDERS", getterKey: "getModerationProvider" }
};

/** The three provider maps inside the audio registry. */
const AUDIO_MAP_KEYS = {
  speech: { mapKey: "AUDIO_SPEECH_PROVIDERS", getterKey: "getSpeechProvider" },
  transcription: { mapKey: "AUDIO_TRANSCRIPTION_PROVIDERS", getterKey: "getTranscriptionProvider" },
  translation: { mapKey: "AUDIO_TRANSLATION_PROVIDERS", getterKey: "getTranslationProvider" }
};

/** Bonus granular audio sub-kinds that map back onto the audio registry. */
const AUDIO_SUB_KINDS = {
  "audio-speech": "speech",
  "audio-transcription": "transcription",
  "audio-translation": "translation"
};

/** Every kind the unified API understands (primary + audio sub-kinds). */
const ALL_KINDS = Object.freeze([...Object.keys(KIND_DEFS), ...Object.keys(AUDIO_SUB_KINDS)]);

// kind -> loaded descriptor { ok, degraded, registry, getProvider, parts? } | null
const cache = new Map();
// kind -> 'ok' | 'degraded' | 'missing'
const status = new Map();

/* ----------------------------------------------------------------------------
 * Low-level helpers
 * -------------------------------------------------------------------------- */

/** Non-fatal warning; never throws. */
function warn(kind, err) {
  const msg = err && err.message ? err.message.split("\n")[0] : String(err);
  log.warn("MEDIA_REGISTRY", `registry "${kind}" unavailable (${msg}); treating as empty.`);
}

/** Safe map extraction — returns {} when the export is missing/malformed. */
function extractMap(m, mapKey) {
  const reg = m && m[mapKey];
  return reg && typeof reg === "object" ? reg : {};
}

/** Prefer the registry's own getter; fall back to direct map lookup. */
function extractGetter(m, getterKey, reg) {
  return typeof m?.[getterKey] === "function" ? m[getterKey] : (id) => reg[id] ?? null;
}

/** Build a descriptor for a simple (map-based) registry from its module. */
function buildSimpleDescriptor(m, mapKey, getterKey) {
  const registry = extractMap(m, mapKey);
  return {
    ok: true,
    degraded: !m?.[mapKey],
    registry,
    getProvider: extractGetter(m, getterKey, registry),
    listProviderIds: () => Object.keys(registry)
  };
}

/** Build a descriptor for the audio registry (three provider maps) from its module. */
function buildAudioDescriptor(m) {
  const parts = {};
  let degraded = false;
  for (const [subKey, meta] of Object.entries(AUDIO_MAP_KEYS)) {
    const registry = extractMap(m, meta.mapKey);
    if (!m?.[meta.mapKey]) degraded = true;
    parts[subKey] = {
      registry,
      getProvider: extractGetter(m, meta.getterKey, registry)
    };
  }
  return {
    ok: true,
    degraded,
    registry: {
      speech: parts.speech.registry,
      transcription: parts.transcription.registry,
      translation: parts.translation.registry
    },
    getProvider: (id) => {
      for (const subKey of ["speech", "transcription", "translation"]) {
        const config = parts[subKey].getProvider(id);
        if (config) return config;
      }
      return null;
    },
    listProviderIds: () => {
      const ids = new Set();
      for (const subKey of ["speech", "transcription", "translation"]) {
        for (const id of Object.keys(parts[subKey].registry)) ids.add(id);
      }
      return [...ids];
    },
    parts
  };
}

/* ----------------------------------------------------------------------------
 * Loading (static, cached)
 * -------------------------------------------------------------------------- */

/** Load (or fetch from cache) the descriptor for a primary kind. */
async function loadKind(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const def = KIND_DEFS[kind];
  if (!def) return null;

  let loaded = null;
  if (def.audio) {
    loaded = buildAudioDescriptor(def.module);
  } else if (def.module) {
    // Static import: descriptor built synchronously from the imported module.
    loaded = buildSimpleDescriptor(def.module, def.mapKey, def.getterKey);
  }

  cache.set(kind, loaded);
  status.set(kind, !loaded ? "missing" : loaded.degraded ? "degraded" : "ok");
  return loaded;
}

/** Map a user-supplied kind (possibly an audio sub-kind) to { base, subKey }. */
function resolveKind(kind) {
  const subKey = AUDIO_SUB_KINDS[kind];
  return subKey ? { base: "audio", subKey } : { base: kind, subKey: null };
}

/** Resolve a kind to its loaded descriptor (or null when unavailable). */
async function getLoaded(kind) {
  const { base, subKey } = resolveKind(kind);
  const loaded = await loadKind(base);
  if (!loaded) return null;
  if (subKey && loaded.parts) return loaded.parts[subKey] || null;
  return loaded;
}

/* ----------------------------------------------------------------------------
 * A) Unified media-pipeline accessors
 * -------------------------------------------------------------------------- */

/**
 * Get the provider config for a kind + provider id, or null when absent.
 * @param {"image"|"video"|"upscale"|"music"|"audio"|"ocr"|"rerank"|"moderation"|"audio-speech"|"audio-transcription"|"audio-translation"} kind
 * @param {string} providerId
 * @returns {Promise<object|null>}
 */
export async function getMediaProvider(kind, providerId) {
  const loaded = await getLoaded(kind);
  if (!loaded) return null;
  try {
    return loaded.getProvider(providerId) ?? null;
  } catch (err) {
    warn(kind, err);
    return null;
  }
}

/**
 * List all provider ids registered for a kind (empty array when degraded).
 * @returns {Promise<string[]>}
 */
export async function listMediaProviders(kind) {
  const loaded = await getLoaded(kind);
  if (!loaded) return [];
  try {
    if (typeof loaded.listProviderIds === "function") return loaded.listProviderIds();
    return Object.keys(loaded.registry || {});
  } catch (err) {
    warn(kind, err);
    return [];
  }
}

/**
 * Whether a provider id exists for a kind.
 * @returns {Promise<boolean>}
 */
export async function hasMediaProvider(kind, providerId) {
  const loaded = await getLoaded(kind);
  if (!loaded) return false;
  try {
    return Boolean(loaded.getProvider(providerId));
  } catch (err) {
    warn(kind, err);
    return false;
  }
}

/**
 * Raw registry for a kind.
 *  - Simple kinds: the provider map (object keyed by provider id).
 *  - audio: { speech, transcription, translation } (the three raw maps).
 *  - audio sub-kinds: the individual raw map.
 * @returns {Promise<object>}
 */
export async function getMediaRegistry(kind) {
  const loaded = await getLoaded(kind);
  return loaded ? loaded.registry : {};
}

/**
 * Load health per kind: 'ok' | 'degraded' | 'missing'.
 * @returns {Promise<Record<string, string>>}
 */
export async function getMediaRegistryStatus() {
  const out = {};
  for (const kind of ALL_KINDS) {
    const { base, subKey } = resolveKind(kind);
    const loaded = await loadKind(base);
    if (!loaded) {
      out[kind] = "missing";
    } else if (subKey) {
      out[kind] = loaded.parts?.[subKey] ? (loaded.degraded ? "degraded" : "ok") : "missing";
    } else {
      out[kind] = loaded.degraded ? "degraded" : "ok";
    }
  }
  return out;
}

/** Every kind understood by the unified API. */
export const MEDIA_REGISTRY_KINDS = ALL_KINDS;

/* ----------------------------------------------------------------------------
 * B) Dashboard listing helpers (synchronous, backward compatible)
 * -------------------------------------------------------------------------- */

/** kind -> raw registry object for the statically-imported dashboard kinds. */
export const KIND_REGISTRIES = {
  upscale: UPSCALE_PROVIDERS,
  music: MUSIC_PROVIDERS,
  ocr: OCR_PROVIDERS,
  rerank: RERANK_PROVIDERS,
  moderation: MODERATION_PROVIDERS
};

/** Curated display names for known provider ids (fallback: humanized id). */
const DISPLAY_NAMES = {
  // upscale
  "adobe-firefly": "Adobe Firefly",
  "stability-ai": "Stability AI",
  topaz: "Topaz Labs",
  // music
  vertex: "Google Vertex AI",
  "fal-ai": "FAL.ai",
  kie: "KIE",
  suno: "Suno",
  udio: "Udio",
  minimax: "MiniMax",
  comfyui: "ComfyUI",
  // ocr
  mistral: "Mistral",
  "azure-document-intelligence": "Azure Document Intelligence",
  "vertex-deepseek-ocr": "Vertex DeepSeek OCR",
  // rerank
  cohere: "Cohere",
  together: "Together AI",
  nvidia: "NVIDIA",
  fireworks: "Fireworks AI",
  "voyage-ai": "Voyage AI",
  "jina-ai": "Jina AI",
  siliconflow: "SiliconFlow",
  openrouter: "OpenRouter",
  deepinfra: "DeepInfra",
  // moderation
  openai: "OpenAI"
};

const ACRONYM_RE = /^(ai|api|ocr|sdk|id|url|aws|gcp)$/i;

/** kebab/snake-case provider id -> human-readable display name. */
export function humanizeProviderId(providerId) {
  const id = String(providerId || "");
  if (DISPLAY_NAMES[id]) return DISPLAY_NAMES[id];
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => (ACRONYM_RE.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** Normalize one provider config entry into the dashboard item shape. */
export function toProviderItem(kind, config, fallbackId) {
  const id = config?.id || fallbackId || kind;
  const models = Array.isArray(config?.models) ? config.models : [];
  return {
    id,
    name: humanizeProviderId(id),
    category: kind,
    kind,
    modelCount: models.length,
    models: models.map((m) => ({ id: m.id, name: m.name })),
    format: config?.format || null,
    authType: config?.authType || null,
    baseUrl: config?.baseUrl || null,
    unsupported: config?.unsupported === true
  };
}

/** Providers for a single media kind (e.g. "upscale"). Unknown kind -> []. */
export function getRegistryProviders(kind) {
  const registry = KIND_REGISTRIES[kind];
  if (!registry) return [];
  return Object.entries(registry).map(([key, config]) => toProviderItem(kind, config, key));
}

/**
 * Union of providers across all ported media registries.
 * Returns: { upscale: [...], music: [...], ocr: [...], rerank: [...], moderation: [...] }
 */
export function getAllRegistryProviders() {
  const providers = {};
  for (const kind of Object.keys(KIND_REGISTRIES)) {
    providers[kind] = getRegistryProviders(kind);
  }
  return providers;
}

/* ----------------------------------------------------------------------------
 * Warm-up
 * -------------------------------------------------------------------------- */

// Fire-and-forget warm-up of the lazy kinds so the engine's first awaited call
// is already cached. Failures are swallowed by loadKind's try/catch.
void Promise.allSettled(["image", "video", "audio"].map((kind) => loadKind(kind)));
