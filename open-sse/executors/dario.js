import { BaseExecutor } from "./base.js";
import { mergeUpstreamExtraHeaders, mergeAbortSignals } from "./executorUtils.js";

import { HTTP_STATUS, FETCH_TIMEOUT_MS } from "../utils/omni/executorConstants.js";
import { getProviderPluginManifestHeader } from "../utils/omni/providerPluginManifestUrl.js";
const DEFAULT_PORT = 3456;
const DEFAULT_HOST = "127.0.0.1";
const HEALTH_CHECK_TIMEOUT_MS = 5e3;
let _cachedSettingsUrl = null;
const URL_CACHE_TTL_MS = 6e4;
function clearDarioUrlCache() {
  _cachedSettingsUrl = null;
}
(async () => {
  try {
    const { getSettings } = await import("../utils/omni/settings.js");
    const settings = await getSettings();
    if (typeof settings.dario_url === "string" && settings.dario_url.trim()) {
      _cachedSettingsUrl = { url: settings.dario_url.trim(), ts: Date.now() };
    }
  } catch {
  }
})();
async function resolveDarioBaseUrl() {
  if (_cachedSettingsUrl && Date.now() - _cachedSettingsUrl.ts < URL_CACHE_TTL_MS) {
    return _cachedSettingsUrl.url;
  }
  try {
    const { getSettings } = await import("../utils/omni/settings.js");
    const settings = await getSettings();
    if (typeof settings.dario_url === "string" && settings.dario_url.trim()) {
      const url2 = settings.dario_url.trim();
      _cachedSettingsUrl = { url: url2, ts: Date.now() };
      return url2;
    }
  } catch {
  }
  const host = process.env.DARIO_HOST || DEFAULT_HOST;
  const port = parseInt(process.env.DARIO_PORT || String(DEFAULT_PORT), 10);
  const url = `http://${host}:${port}`;
  _cachedSettingsUrl = { url, ts: Date.now() };
  return url;
}
function resolveDarioBaseUrlSync() {
  if (_cachedSettingsUrl && Date.now() - _cachedSettingsUrl.ts < URL_CACHE_TTL_MS) {
    return _cachedSettingsUrl.url;
  }
  const host = process.env.DARIO_HOST || DEFAULT_HOST;
  const port = parseInt(process.env.DARIO_PORT || String(DEFAULT_PORT), 10);
  return `http://${host}:${port}`;
}
function isDarioDeepModeEnabled(providerSpecificData) {
  return providerSpecificData?.darioMode === "claude-native";
}
class DarioExecutor extends BaseExecutor {
  upstreamBaseUrl;
  constructor(baseUrl) {
    const effectiveBase = baseUrl ?? resolveDarioBaseUrlSync();
    super("dario", {
      id: "dario",
      baseUrl: effectiveBase + "/v1/chat/completions",
      headers: { "Content-Type": "application/json" }
    });
    this.upstreamBaseUrl = effectiveBase;
  }
  buildUrl(_model, _stream, _urlIndex = 0, _credentials = null) {
    return `${this.upstreamBaseUrl}/v1/chat/completions`;
  }
  /**
   * Returns true when the body matches the Anthropic Messages wire shape.
   * Same detection heuristics as CliproxyapiExecutor.isAnthropicShape: an
   * Anthropic-source client (`/v1/messages`, anthropic-version header, claude/*
   * model) is not openai-translated by chatCore, so the executor sees the
   * original Anthropic body. Dario exposes both `/v1/messages` (Anthropic SSE)
   * and `/v1/chat/completions` (OpenAI SSE) on the same port with the shape
   * auto-detected — route to the matching one so Anthropic-SDK clients get
   * proper `event: message_start` / `content_block_delta` frames.
   */
  isAnthropicShape(body) {
    if (!body || typeof body !== "object") return false;
    const b = body;
    if (b.system !== void 0) return true;
    if (b.thinking !== void 0) return true;
    if (b.metadata && typeof b.metadata === "object" && b.metadata.user_id !== void 0)
      return true;
    const msgs = b.messages;
    if (Array.isArray(msgs) && msgs.length > 0) {
      const first = msgs[0];
      if (Array.isArray(first?.content)) return true;
    }
    return false;
  }
  selectEndpoint(body) {
    return this.isAnthropicShape(body) ? "/v1/messages" : "/v1/chat/completions";
  }
  buildHeaders(credentials, stream = true) {
    const key = credentials?.apiKey || credentials?.accessToken || "dario";
    const headers = {
      "Content-Type": "application/json",
      ...getProviderPluginManifestHeader()
    };
    headers["Authorization"] = `Bearer ${key}`;
    if (stream) {
      headers["Accept"] = "text/event-stream";
    }
    return headers;
  }
  transformRequest(model, body, _stream, _credentials) {
    if (!body || typeof body !== "object") return body;
    const transformed = { ...body };
    if (transformed.model !== model) {
      transformed.model = model;
    }
    return transformed;
  }
  async execute(input) {
    const baseUrl = await resolveDarioBaseUrl();
    const endpoint = this.selectEndpoint(input.body);
    const url = `${baseUrl}${endpoint}`;
    const shape = endpoint === "/v1/messages" ? "anthropic" : "openai";
    const headers = this.buildHeaders(input.credentials, input.stream);
    const transformedBody = this.transformRequest(
      input.model,
      input.body,
      input.stream,
      input.credentials
    );
    mergeUpstreamExtraHeaders(headers, input.upstreamExtraHeaders);
    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const combinedSignal = input.signal ? mergeAbortSignals(input.signal, timeoutSignal) : timeoutSignal;
    input.log?.info?.("DARIO", `Dario \u2192 ${url} (model: ${input.model}, shape: ${shape})`);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(transformedBody),
      signal: combinedSignal
    });
    if (response.status === HTTP_STATUS.RATE_LIMITED) {
      input.log?.warn?.("DARIO", `Dario rate limited: ${response.status}`);
    }
    return { response, url, headers, transformedBody };
  }
  /**
   * Health check — verifies Dario is reachable.
   *
   * Dario's `/health` returns 200 {status:"ok"} once ≥1 healthy account exists
   * and 503 {status:"degraded"} while zero accounts are configured (or all are
   * in auth-cooldown). We treat this as a plain `res.ok` check: 503-while-empty
   * is semantically correct ("reachable but not yet useful"), so the dashboard
   * shows running+degraded until the operator completes the Claude OAuth login.
   */
  async healthCheck() {
    const start = Date.now();
    try {
      const baseUrl = await resolveDarioBaseUrl();
      const res = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS)
      });
      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        ...!res.ok ? { error: `HTTP ${res.status}` } : {}
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}
var dario_default = DarioExecutor;
export {
  DarioExecutor,
  clearDarioUrlCache,
  dario_default as default,
  isDarioDeepModeEnabled,
  resolveDarioBaseUrl
};
