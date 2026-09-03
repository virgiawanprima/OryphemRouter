// ModelVerifier — "anti-kebohongan" model authenticity check.
//
// Given a provider + credentials, it fetches the provider's REAL model catalog and
// diffs it against the models we advertise, classifying each as:
//   verified  — the advertised id exists in the real catalog
//   corrected — the advertised id maps to a real catalog id via upstreamModelId
//   missing   — advertised but NOT in the real catalog (fake/stale/typo)
//
// Always fail-open: if the live catalog cannot be fetched (offline, no endpoint,
// auth error) it returns `live: null` and marks nothing as fake — key validation
// is never blocked by this check.

import { PROVIDERS } from "../config/providers.js";
import { getProviderModels } from "../config/providerModels.js";
import { deriveModelName } from "../providers/models/namePatterns.js";

// Well-known live model endpoints for built-in API-key providers.
const MODELS_ENDPOINTS = {
  openai: { url: "https://api.openai.com/v1/models", auth: "Bearer" },
  anthropic: { url: "https://api.anthropic.com/v1/models", auth: "x-api-key" },
  deepseek: { url: "https://api.deepseek.com/models", auth: "Bearer" },
  xai: { url: "https://api.x.ai/v1/models", auth: "Bearer" },
  groq: { url: "https://api.groq.com/openai/v1/models", auth: "Bearer" },
  openrouter: { url: "https://openrouter.ai/api/v1/models", auth: "Bearer" },
  perplexity: { url: "https://api.perplexity.ai/models", auth: "Bearer" },
  "fireworks-ai": { url: "https://api.fireworks.ai/inference/v1/models", auth: "Bearer" },
  together: { url: "https://api.together.xyz/v1/models", auth: "Bearer" },
  mistral: { url: "https://api.mistral.ai/v1/models", auth: "Bearer" },
  "openai-compatible": { url: null, auth: "Bearer" }, // baseUrl from credentials
  "anthropic-compatible": { url: null, auth: "x-api-key" },
  // ── New ported providers (OmniRoute) — explicit endpoints/auth ──────────
  deepinfra: { url: "https://api.deepinfra.com/v1/models", auth: "Bearer" },
  moonshot: { url: "https://api.moonshot.ai/v1/models", auth: "Bearer" },
  ai21: { url: "https://api.ai21.com/studio/v1/models", auth: "Bearer" },
  upstage: { url: "https://api.upstage.ai/v1/models", auth: "Bearer" },
  baseten: { url: "https://model-{deployment}.api.baseten.co/production/v1/models", auth: "Bearer" },
  deepai: { url: "https://api.deepai.org/models", auth: "Bearer" },
  databricks: { url: null, auth: "Bearer" }, // derived from credentials baseUrl
  digitalocean: { url: null, auth: "Bearer" },
  codestral: { url: "https://codestral.mistral.ai/v1/models", auth: "Bearer" },
  groq: { url: "https://api.groq.com/openai/v1/models", auth: "Bearer" },
  cerebras: { url: "https://api.cerebras.ai/v1/models", auth: "Bearer" },
  nebul: { url: "https://api.nebius.ai/v1/models", auth: "Bearer" },
  nvidia: { url: "https://integrate.api.nvidia.com/v1/models", auth: "Bearer" },
  sambanova: { url: "https://api.sambanova.ai/v1/models", auth: "Bearer" },
  "featherless-ai": { url: "https://api.featherless.ai/v1/models", auth: "Bearer" },
  deepseek: { url: "https://api.deepseek.com/models", auth: "Bearer" },
  novita: { url: "https://api.novita.ai/v3/openai/models", auth: "Bearer" },
  "inference-net": { url: null, auth: "Bearer" },
  together: { url: "https://api.together.xyz/v1/models", auth: "Bearer" },
  mistral: { url: "https://api.mistral.ai/v1/models", auth: "Bearer" },
  nscale: { url: "https://api.nscale.com/v1/models", auth: "Bearer" },
  "api-airforce": { url: null, auth: "Bearer" },
  openrouter: { url: "https://openrouter.ai/api/v1/models", auth: "Bearer" },
  glm: { url: "https://open.bigmodel.cn/api/paas/v4/models", auth: "Bearer" },
  zai: { url: "https://api.z.ai/api/paas/v4/models", auth: "Bearer" },
  minimax: { url: "https://api.minimax.io/v1/models", auth: "Bearer" },
  "minimax-cn": { url: "https://api.minimax.chat/v1/models", auth: "Bearer" },
  kimi: { url: "https://api.moonshot.cn/v1/models", auth: "Bearer" },
  "qwen-cloud": { url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models", auth: "Bearer" },
  alibaba: { url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models", auth: "Bearer" },
  "alibaba-cn": { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models", auth: "Bearer" },
  baidu: { url: "https://qianfan.baidubce.com/v2/models", auth: "Bearer" },
  doubao: { url: "https://ark.cn-beijing.volces.com/api/v3/models", auth: "Bearer" },
  volcengine: { url: "https://ark.cn-beijing.volces.com/api/v3/models", auth: "Bearer" },
  tencent: { url: null, auth: "Bearer" },
  "stepfun": { url: "https://api.stepfun.com/v1/models", auth: "Bearer" },
  hunyuan: { url: null, auth: "Bearer" },
  "model-best": { url: "https://api.modelbest.cn/v1/models", auth: "Bearer" },
  moonshotai: { url: "https://api.moonshot.ai/v1/models", auth: "Bearer" },
  yi: { url: "https://api.lingyiwanwu.com/v1/models", auth: "Bearer" },
  siliconsky: { url: "https://api.siliconflow.cn/v1/models", auth: "Bearer" },
  siliconflow: { url: "https://api.siliconflow.cn/v1/models", auth: "Bearer" },
  internlm: { url: "https://api.internlm.chat/v1/models", auth: "Bearer" },
  "01-ai": { url: "https://api.lingyiwanwu.com/v1/models", auth: "Bearer" },
  iflytek: { url: null, auth: "Bearer" },
  sparkdesk: { url: null, auth: "Bearer" },
  "clova-studio": { url: null, auth: "Bearer" },
  reka: { url: "https://api.reka.ai/v1/models", auth: "Bearer" },
  cohere: { url: "https://api.cohere.com/v1/models", auth: "Bearer" },
  "nous-research": { url: null, auth: "Bearer" },
  liquid: { url: "https://api.liquid.ai/v1/models", auth: "Bearer" },
  "meta-llama": { url: "https://api.llama.com/v1/models", auth: "Bearer" },
  "lambda-ai": { url: "https://api.lambdalabs.com/v1/models", auth: "Bearer" },
  hyperbolic: { url: "https://api.hyperbolic.xyz/v1/models", auth: "Bearer" },
  nlpcloud: { url: null, auth: "Bearer" },
  "nebius-ai": { url: "https://api.nebius.ai/v1/models", auth: "Bearer" },
  "moonshot-kimi": { url: "https://api.moonshot.cn/v1/models", auth: "Bearer" },
  sailor: { url: null, auth: "Bearer" },
  opengpu: { url: "https://api.opengpu.com/v1/models", auth: "Bearer" },
  "21yep": { url: null, auth: "Bearer" },
  "99ai": { url: null, auth: "Bearer" },
  aihubmix: { url: "https://aihubmix.com/v1/models", auth: "Bearer" },
  gpt3: { url: null, auth: "Bearer" },
  getinference: { url: null, auth: "Bearer" },
  "inf3rno": { url: null, auth: "Bearer" },
  "microsoft-designer-web": { url: null, auth: "Bearer" },
  "chatgpt-web": { url: null, auth: "Bearer" },
  "claude-web": { url: null, auth: "Bearer" },
  "gemini-web": { url: null, auth: "Bearer" },
  "deepseek-web": { url: null, auth: "Bearer" },
  "kimi-web": { url: null, auth: "Bearer" },
  "qwen-web": { url: null, auth: "Bearer" },
  "doubao-web": { url: null, auth: "Bearer" },
  "yuanbao-web": { url: null, auth: "Bearer" },
  "poe-web": { url: null, auth: "Bearer" },
  "zai-web": { url: null, auth: "Bearer" },
  "tencent-aistudio-web": { url: null, auth: "Bearer" },
  "perplexity-web": { url: null, auth: "Bearer" },
  "blackbox-web": { url: null, auth: "Bearer" },
  "huggingchat": { url: null, auth: "Bearer" },
  lmarena: { url: null, auth: "Bearer" },
  "felo-web": { url: null, auth: "Bearer" },
  "duckduckgo-web": { url: null, auth: "Bearer" },
  "copilot-web": { url: null, auth: "Bearer" },
  "muse-spark-web": { url: null, auth: "Bearer" },
  "zai": { url: "https://api.z.ai/api/paas/v4/models", auth: "Bearer" },
};

function authHeaders(endpoint, apiKey) {
  if (!apiKey) return { Accept: "application/json" };
  if (endpoint.auth === "x-api-key") {
    return { Accept: "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  }
  return { Accept: "application/json", Authorization: `Bearer ${apiKey}` };
}

// Parse an OpenAI/Anthropic-style catalog body into [{id, name}].
function parseCatalog(data) {
  const list = Array.isArray(data)
    ? data
    : data?.data || data?.models || data?.results || [];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    if (typeof raw === "string") {
      out.push({ id: raw, name: deriveModelName(raw) });
      continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id ?? raw.model ?? raw.slug ?? raw.name ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      name: raw.display_name ?? raw.displayName ?? raw.name ?? deriveModelName(id),
    });
  }
  return out;
}

async function fetchCatalog(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return parseCatalog(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify a provider's advertised models against its real catalog.
 * @param {object} opts
 * @param {string} opts.provider  - provider id (full)
 * @param {object} [opts.credentials] - { apiKey, accessToken, providerSpecificData }
 * @param {string[]} [opts.additionalModels] - user-added/custom model ids to check
 * @returns {Promise<{ live: Array|null, verified: string[], corrected: string[], missing: string[], catalog: Array }>}
 */
export async function verifyProviderModels({ provider, credentials = {}, additionalModels = [] }) {
  const providerId = String(provider || "").toLowerCase();

  // Determine endpoint.
  let endpoint = MODELS_ENDPOINTS[providerId] || null;
  if (!endpoint && providerId.startsWith("openai-compatible")) {
    endpoint = MODELS_ENDPOINTS["openai-compatible"];
  } else if (!endpoint && providerId.startsWith("anthropic-compatible")) {
    endpoint = MODELS_ENDPOINTS["anthropic-compatible"];
  }

  // Compatible providers carry their own baseUrl; built-ins use the known map.
  let url = endpoint?.url || null;
  if (!url && (providerId.startsWith("openai-compatible") || providerId.startsWith("anthropic-compatible"))) {
    const base = credentials?.providerSpecificData?.baseUrl;
    if (base) {
      const cleaned = String(base).replace(/\/+$/, "").replace(/\/v1\/messages$/, "");
      url = `${cleaned}/models`;
    }
  }
  // Registry-declared validation endpoint wins over derivation when present
  // (most accurate — sourced from the provider's own transport config).
  const transport = PROVIDERS[providerId];
  if (!url && transport?.validateUrl) {
    url = transport.validateUrl;
  } else if (!url && transport?.modelsFetcher?.url) {
    url = transport.modelsFetcher.url;
  }
  // Last resort: derive from transport baseUrl if the provider has one.
  if (!url && transport?.baseUrl) {
    const base = String(transport.baseUrl).replace(/\/+$/, "");
    // If baseUrl already ends in a well-known path, derive the models path.
    const stripped = base
      .replace(/\/chat\/completions$/, "")
      .replace(/\/v1\/messages$/, "")
      .replace(/\/responses$/, "");
    url = `${stripped}/models`;
  }

  const apiKey = credentials?.apiKey || credentials?.accessToken;
  // Pick auth scheme: explicit endpoint config → registry transport → default bearer.
  let auth = { Accept: "application/json" };
  if (endpoint) {
    auth = authHeaders(endpoint, apiKey);
  } else if (transport?.format === "claude") {
    auth = authHeaders({ auth: "x-api-key", header: "x-api-key" }, apiKey);
  } else if (apiKey) {
    auth = { Accept: "application/json", Authorization: `Bearer ${apiKey}` };
  }
  let live = null;
  if (url) live = await fetchCatalog(url, auth);

  // Advertised set = static registry models + custom models.
  const staticModels = getProviderModels(providerId);
  const advertisedIds = new Set([
    ...staticModels.map((m) => m.id),
    ...additionalModels,
  ].filter(Boolean));

  const liveIds = new Set((live || []).map((m) => m.id));
  const verified = [];
  const corrected = [];
  const missing = [];

  for (const id of advertisedIds) {
    if (liveIds.has(id)) {
      verified.push(id);
      continue;
    }
    // Check if the model maps to a real catalog id via upstreamModelId.
    const model = staticModels.find((m) => m.id === id);
    const wireId = model?.upstreamModelId;
    if (wireId && liveIds.has(wireId)) {
      corrected.push({ id, realId: wireId });
    } else if (!live) {
      // No live catalog — cannot call it fake; leave it out of missing.
      // (kept out of missing so we don't false-positive when offline)
    } else {
      missing.push(id);
    }
  }

  return {
    live,
    verified,
    corrected,
    missing,
    catalog: live || [],
  };
}
