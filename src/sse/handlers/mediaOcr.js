import { parseJson } from "@/lib/utils/parseJson";
import {
  extractApiKey,
  isValidApiKey,
  getProviderCredentials,
  markAccountUnavailable,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import {
  handleOcr,
  VERTEX_DEEPSEEK_OCR_PROVIDER_ID,
} from "open-sse/handlers/ocr.js";
import { parseOcrModel } from "open-sse/utils/omni/ocrRegistry.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";

/**
 * Resolve the OCR provider from the request body.
 *
 * The handler derives the provider from the model string in `provider/model`
 * form (see `parseOcrModel` in open-sse/utils/omni/ocrRegistry.js). This wrapper
 * also accepts an explicit `provider` field, and defaults to the Vertex DeepSeek
 * OCR provider when the body specifies neither.
 *
 * @param {object} body
 * @returns {string}
 */
function resolveOcrProvider(body) {
  if (typeof body?.provider === "string" && body.provider.trim()) {
    return body.provider.trim();
  }
  const parsed = parseOcrModel(body?.model);
  if (parsed?.provider) return parsed.provider;
  return VERTEX_DEEPSEEK_OCR_PROVIDER_ID;
}

/**
 * Normalize a handleOcr result into { status, error } for fallback bookkeeping.
 *
 * The ported handler returns Response objects directly; also handle the
 * { success: false, status, error } shape defensively in case the handler
 * contract changes.
 *
 * @param {Response|{success:boolean,status?:number,error?:string}|undefined} result
 * @returns {Promise<{status:number,error:string}>}
 */
async function extractOcrError(result) {
  if (result instanceof Response) {
    let error = "";
    try {
      const data = await result.clone().json();
      error = data?.error?.message || data?.error || data?.message || "";
      if (typeof error !== "string") error = JSON.stringify(error);
    } catch {
      try {
        error = await result.clone().text();
      } catch { /* ignore */ }
    }
    return {
      status: result.status,
      error: error ? String(error).slice(0, 300) : "OCR request failed",
    };
  }
  return {
    status: result?.status || HTTP_STATUS.BAD_GATEWAY,
    error: result?.error || "OCR request failed",
  };
}

/**
 * Handle OCR request (OpenAI-compatible /v1/ocr).
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleOcrRequest(request) {
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
  log.request("POST", `${url.pathname} | ${body.model || "ocr"}`);

  // Auth: optional API key gate
  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  if (!body.document) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: document");
  }

  const provider = resolveOcrProvider(body);
  const parsedModel = parseOcrModel(body.model);
  const model = parsedModel?.model || (typeof body.model === "string" ? body.model : null);
  log.info("ROUTING", `Provider: ${provider}${model ? `, Model: ${model}` : ""}`);

  // Credentialed providers — fallback loop (same pattern as mediaMusic/tts)
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
      if (excludeConnectionIds.size === 0) return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const result = await handleOcr({ body, credentials, log });

    // The ported OCR handler returns a Response directly (200 JSON with parsed
    // OCR data, or an error Response). Pass successful responses straight through.
    if (result instanceof Response && result.ok) {
      return result;
    }

    // Defensive: also accept the { success: true, data } shape.
    if (result && typeof result === "object" && result.success === true) {
      return new Response(JSON.stringify(result.data ?? {}), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const { status, error } = await extractOcrError(result);

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, status, error, provider, model);
    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = error;
      lastStatus = status;
      continue;
    }

    // Return the original error Response (already OpenAI-shaped with CORS) or synthesize one.
    if (result instanceof Response) return result;
    return errorResponse(status, error);
  }
}
