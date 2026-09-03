import { parseJson } from "@/lib/utils/parseJson";
import {
  extractApiKey,
  isValidApiKey,
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { handleRerank } from "open-sse/handlers/rerank.js";
import { parseRerankModel, getRerankProvider } from "open-sse/utils/omni/rerankRegistry.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";

/**
 * Extract { status, message } from a non-2xx Response returned by handleRerank.
 * handleRerank returns OpenAI-compatible error bodies ({ error: { message } }).
 */
async function extractErrorInfo(response) {
  let message = "Rerank request failed";
  try {
    const data = await response.json();
    message = data?.error?.message || data?.message || message;
  } catch {
    // fall back to default message
  }
  return { status: response?.status || HTTP_STATUS.BAD_GATEWAY, message };
}

/**
 * Handle rerank request for the SSE/Next.js server.
 * Follows the same auth + credentialed fallback pattern as the
 * tts / embeddings / search handlers.
 *
 * Provider is taken from body.model ("provider/model") or body.provider.
 *
 * @param {Request} request
 */
export async function handleRerankRequest(request) {
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
  const modelStr = typeof body.model === "string" ? body.model.trim() : "";

  log.request("POST", `${url.pathname} | ${modelStr}`);

  // Enforce API key if enabled in settings
  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  // Field validation happens here (before the credentialed loop) so that client
  // errors never mark accounts unavailable via markAccountUnavailable.
  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!body.query) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: query");
  if (!Array.isArray(body.documents) || body.documents.length === 0) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: documents (must be a non-empty array)");
  }

  // Provider from body.model ("provider/model") or body.provider
  const { provider: modelProvider, model: parsedModel } = parseRerankModel(modelStr);
  const provider = modelProvider || (typeof body.provider === "string" && body.provider.trim()) || null;
  const modelId = parsedModel || modelStr || null;

  if (!provider) {
    return errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      "Missing provider: model must be in 'provider/model' format or provide body.provider"
    );
  }
  if (!getRerankProvider(provider)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `No rerank provider found for model "${modelStr}"`);
  }

  // handleRerank expects a "provider/model" model string — synthesize it when
  // only body.provider was supplied (e.g. { provider: "cohere", model: "rerank-v3.5" }).
  const effectiveModel = modelProvider ? modelStr : `${provider}/${modelStr}`;

  log.info("ROUTING", `Provider: ${provider}, Model: ${modelId}`);

  // Credentialed providers — fallback loop (mirrors embeddings/search)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, modelId);

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("RERANK", `[${provider}/${modelId}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${modelId}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.error("AUTH", `No credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      log.warn("RERANK", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    let result;
    try {
      result = await handleRerank({
        ...body,
        model: effectiveModel,
        credentials,
        connectionId: credentials.connectionId || null,
        log,
      });
    } catch (err) {
      result = errorResponse(HTTP_STATUS.SERVER_ERROR, `Rerank request failed: ${err.message}`);
    }

    // Success — handleRerank returns a JSON 200 Response with data
    if (result && result.status === 200) {
      if (credentials.connectionId) {
        clearAccountError(credentials.connectionId, credentials, modelId).catch(() => {});
      }
      return result;
    }

    // Failure — parse the error and run the markAccountUnavailable fallback
    const { status, message } = await extractErrorInfo(result);
    const { shouldFallback } = await markAccountUnavailable(
      credentials.connectionId,
      status,
      message,
      provider,
      modelId
    );

    if (shouldFallback) {
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = message;
      lastStatus = status;
      continue;
    }

    return errorResponse(status || HTTP_STATUS.BAD_GATEWAY, message);
  }
}
