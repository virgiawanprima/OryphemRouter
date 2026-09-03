import { parseJson } from "../../lib/utils/parseJson.js";
import { handleAudioSpeech } from "../../../open-sse/handlers/audioSpeech.js";
import { handleAudioTranscription } from "../../../open-sse/handlers/audioTranscription.js";
import { handleAudioTranslation } from "../../../open-sse/handlers/audioTranslation.js";
import { handleOpenRouterTranscription } from "../../../open-sse/handlers/openrouterTranscription.js";
import { getTranscriptionProvider } from "../../../open-sse/config/audioRegistry.js";
import { errorResponse, unavailableResponse } from "../../../open-sse/utils/error.js";
import { HTTP_STATUS } from "../../../open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";

/**
 * Media-provider bridge for the ported OmniRoute audio handlers.
 *
 * Wires the ported handlers in `open-sse/handlers/` (audioSpeech.js,
 * audioTranscription.js, audioTranslation.js, openrouterTranscription.js) into
 * the OryphemRouter request pipeline using the same parse → auth → credentialed
 * fallback loop → respond pattern as `tts.js` / `mediaMusic.js`.
 *
 * The ported handlers accept `{ body | formData, credentials, log }` and resolve
 * their own provider config from the `provider/model` model string, so the bridge
 * only needs to (1) parse the request, (2) enforce the optional API-key gate,
 * (3) run the credentialed fallback loop via `getProviderCredentials`, and
 * (4) return whatever Response the ported handler produced.
 *
 * NOTE ON IMPORTS: this file deliberately uses relative specifiers, and lazily
 * loads `../services/auth.js` + `../../lib/localDb.js` (the only two modules
 * in this graph that use `@/`/`open-sse` aliases), so the module graph loads
 * under a bare `node -e "import('./src/sse/handlers/mediaAudio.js')"` smoke test
 * exactly like the ported handlers (which use relative imports only). Inside
 * Next.js these dynamic imports resolve identically to static `@/` imports.
 */

// ---------------------------------------------------------------------------
// Lazy loaders — keep the alias-heavy app services out of the static graph.
// ---------------------------------------------------------------------------

let authServicePromise = null;
function authService() {
  if (!authServicePromise) {
    authServicePromise = import("../services/auth.js");
  }
  return authServicePromise;
}

let localDbPromise = null;
function localDb() {
  if (!localDbPromise) {
    localDbPromise = import("../../lib/localDb.js");
  }
  return localDbPromise;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Split a `provider/model` model string on the first "/" (mirrors the ported
 * handlers' own parseAudioModel). Returns `{ provider: null, model: null }` when
 * the string has no usable prefix.
 */
function splitProviderModel(modelStr) {
  if (typeof modelStr !== "string") return { provider: null, model: null };
  const slash = modelStr.indexOf("/");
  if (slash <= 0 || slash === modelStr.length - 1) return { provider: null, model: null };
  return { provider: modelStr.slice(0, slash), model: modelStr.slice(slash + 1) };
}

/**
 * Extract the error message from a ported-handler Response without consuming the
 * original body (the original Response is returned to the caller on non-fallback
 * errors). Falls back to the raw body text.
 */
async function extractResponseError(response) {
  try {
    const text = await response.clone().text();
    try {
      const json = JSON.parse(text);
      const msg =
        json?.error?.message ??
        (typeof json?.error === "string" ? json.error : null) ??
        json?.message ??
        text;
      return typeof msg === "string" && msg.length > 0 ? msg : `Upstream error (${response.status})`;
    } catch {
      return text || `Upstream error (${response.status})`;
    }
  } catch {
    return `Upstream error (${response.status})`;
  }
}

/**
 * Pure 4xx client errors (bad model, bad request, unsupported format, …) fail
 * identically on every account, so they must never trigger a credentialed
 * fallback (markAccountUnavailable would otherwise lock healthy accounts).
 * Quota/auth statuses (401/402/403/404/429) are deliberately NOT excluded —
 * they are handled by markAccountUnavailable like in tts.js.
 */
function isClientErrorWithoutFallback(status) {
  return status >= 400 && status < 500 && ![401, 402, 403, 404, 429].includes(status);
}

/**
 * Invoke a ported handler and normalize its result to a Response. The ported
 * handlers are expected to return a Response and to catch their own errors, but
 * this guards against both a thrown error and a non-Response return value.
 */
async function safeInvoke(invoke, credentials) {
  try {
    const result = await invoke(credentials);
    if (result instanceof Response) return result;
    return errorResponse(HTTP_STATUS.BAD_GATEWAY, "Media handler returned an invalid response");
  } catch (err) {
    return errorResponse(HTTP_STATUS.BAD_GATEWAY, `Media request failed: ${err?.message || "unknown error"}`);
  }
}

/**
 * Credentialed fallback loop (mirrors tts.js / mediaMusic.js).
 *
 * - Resolves one connection at a time via `getProviderCredentials`.
 * - Calls the ported handler with `{ body | formData, credentials, log }`.
 * - The ported handlers return a Response directly (unlike ttsCore's
 *   `{ success, ... }`), so a `status >= 400` means failure.
 * - On failure the connection is marked unavailable and the loop retries with
 *   the next account when the failure looks upstream/quota-ish. Pure 4xx client
 *   errors are returned to the client unchanged (no account locking).
 * - When the provider has no stored connections at all, it hands off to the
 *   ported handler with no credentials so no-auth providers (gtts, edgetts,
 *   coqui, tortoise, …) still work; credentialed-but-unconfigured providers
 *   return their own 401/400 from the ported handler.
 */
async function runCredentialedLoop({ provider, model, invoke }) {
  const { getProviderCredentials, markAccountUnavailable } = await authService();
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const msg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model}] ${msg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        // No stored connections — let the ported handler decide.
        return await safeInvoke(invoke, null);
      }
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const result = await safeInvoke(invoke, credentials);

    if (result.status < 400) return result;

    if (isClientErrorWithoutFallback(result.status)) return result;

    const errorText = await extractResponseError(result);
    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, errorText, provider, model);
    if (shouldFallback) {
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${result.status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = errorText;
      lastStatus = result.status;
      continue;
    }
    return result;
  }
}

/**
 * Optional API-key gate (mirrors tts.js): when `requireApiKey` is enabled in
 * settings, extract the key from the request and validate it.
 */
async function enforceApiKey(request) {
  const { extractApiKey, isValidApiKey } = await authService();
  const { getSettings } = await localDb();
  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      return { ok: false, response: errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key") };
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      return { ok: false, response: errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key") };
    }
  }
  return { ok: true, apiKey };
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

/**
 * POST (JSON) → ported `handleAudioSpeech`. Model format: `provider/model`.
 * Compatible with OpenAI /v1/audio/speech request bodies ({ model, input, voice,
 * response_format, speed }).
 */
export async function handleAudioSpeechRequest(request) {
  let body;
  try {
    body = await parseJson(request);
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const url = new URL(request.url);
  const modelStr = body.model;
  log.request("POST", `${url.pathname} | ${modelStr}`);

  const auth = await enforceApiKey(request);
  if (!auth.ok) return auth.response;

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!body.input) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: input");

  const { provider, model } = splitProviderModel(modelStr);
  if (!provider) {
    // Non-prefixed model — the ported handler owns the detailed validation error.
    return safeInvoke((credentials) => handleAudioSpeech({ body, credentials, log }), null);
  }

  return runCredentialedLoop({
    provider,
    model,
    invoke: (credentials) => handleAudioSpeech({ body, credentials, log }),
  });
}

/**
 * POST (multipart/form-data) → ported `handleAudioTranscription`. Model format:
 * `provider/model`. Fields: model, file (+ optional language/prompt/etc. passed
 * through by the ported handler).
 */
export async function handleAudioTranscriptionRequest(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid multipart form data");
  }

  const url = new URL(request.url);
  const modelStr = formData.get("model");
  log.request("POST", `${url.pathname} | ${modelStr}`);

  const auth = await enforceApiKey(request);
  if (!auth.ok) return auth.response;

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!(formData.get("file") instanceof Blob)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: file");
  }

  const { provider, model } = splitProviderModel(String(modelStr));
  if (!provider) {
    return safeInvoke((credentials) => handleAudioTranscription({ formData, credentials, log }), null);
  }

  return runCredentialedLoop({
    provider,
    model,
    invoke: (credentials) => handleAudioTranscription({ formData, credentials, log }),
  });
}

/**
 * POST (multipart/form-data) → ported `handleAudioTranslation`. Model format:
 * `provider/model`. Fields: model, file (+ optional prompt/response_format/…).
 */
export async function handleAudioTranslationRequest(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid multipart form data");
  }

  const url = new URL(request.url);
  const modelStr = formData.get("model");
  log.request("POST", `${url.pathname} | ${modelStr}`);

  const auth = await enforceApiKey(request);
  if (!auth.ok) return auth.response;

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!(formData.get("file") instanceof Blob)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: file");
  }

  const { provider, model } = splitProviderModel(String(modelStr));
  if (!provider) {
    return safeInvoke((credentials) => handleAudioTranslation({ formData, credentials, log }), null);
  }

  return runCredentialedLoop({
    provider,
    model,
    invoke: (credentials) => handleAudioTranslation({ formData, credentials, log }),
  });
}

/**
 * POST (multipart/form-data) → ported `handleOpenRouterTranscription`.
 *
 * The ported openrouter handler has a different contract than the other three:
 * `handleOpenRouterTranscription(provider, file, model, token, formData)` —
 * it does NOT resolve a provider config or credentials itself, so this wrapper
 * resolves the OpenRouter provider config (baseUrl + "openrouter-stt" format)
 * from the full audio registry and feeds it credentials through the same
 * credentialed fallback loop. That's why it lives here in mediaAudio.js rather
 * than being exposed raw from open-sse.
 *
 * Model field: either "openrouter/<model>" or the bare OpenRouter model id
 * (e.g. "deepgram/nova-3", "openai/whisper-1").
 */
export async function handleOpenRouterTranscriptionRequest(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid multipart form data");
  }

  const url = new URL(request.url);
  const modelStr = formData.get("model");
  log.request("POST", `${url.pathname} | ${modelStr}`);

  const auth = await enforceApiKey(request);
  if (!auth.ok) return auth.response;

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof Blob)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: file");
  }

  const providerConfig = getTranscriptionProvider("openrouter");
  if (!providerConfig) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "No transcription provider found for openrouter");
  }

  let modelId = String(modelStr);
  if (modelId.startsWith("openrouter/")) {
    modelId = modelId.slice("openrouter/".length);
  }

  return runCredentialedLoop({
    provider: "openrouter",
    model: modelId,
    invoke: (credentials) => {
      const token = credentials?.apiKey || credentials?.accessToken || null;
      return handleOpenRouterTranscription(providerConfig, fileEntry, modelId, token, formData);
    },
  });
}
