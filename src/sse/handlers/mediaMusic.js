import { parseJson } from "@/lib/utils/parseJson";
import {
  extractApiKey,
  isValidApiKey,
  getProviderCredentials,
  markAccountUnavailable,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { handleMusicGeneration } from "open-sse/handlers/musicGeneration.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";

/**
 * Handle music generation request (OpenAI-compatible /v1/music/generations).
 *
 * Model format: `provider/model` (e.g. `suno/chirp-v4`). The provider prefix is
 * split on the first `/`; the remainder is the provider-specific model id.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleMusicGenerationRequest(request) {
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

  // Auth: optional API key gate
  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");

  // Model format: provider/model — split on first "/"
  const slashIndex = typeof modelStr === "string" ? modelStr.indexOf("/") : -1;
  if (slashIndex <= 0) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format. Use provider/model");
  }
  const provider = modelStr.slice(0, slashIndex);
  const model = modelStr.slice(slashIndex + 1);

  // Credentialed providers — fallback loop (same pattern as tts.js)
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

    const result = await handleMusicGeneration({ body, credentials, log });

    if (result.success) {
      return new Response(JSON.stringify(result.data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);
    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }
    return errorResponse(result.status || HTTP_STATUS.BAD_GATEWAY, result.error || "Music generation failed");
  }
}
