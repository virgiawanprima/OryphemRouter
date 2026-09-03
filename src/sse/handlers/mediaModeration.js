import { parseJson } from "../../lib/utils/parseJson.js";
import { handleModeration } from "../../../open-sse/handlers/moderations.js";
import { errorResponse, unavailableResponse } from "../../../open-sse/utils/error.js";
import { HTTP_STATUS } from "../../../open-sse/config/runtimeConfig.js";
import { parseModerationModel } from "../../../open-sse/utils/omni/moderationRegistry.js";
import * as log from "../utils/logger.js";

const DEFAULT_MODERATION_PROVIDER = "openai";
const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";

/**
 * Best-effort read of a Response body as text without consuming the original
 * (clone() keeps the response usable if it is returned to the client).
 */
async function responseErrorText(response) {
  try {
    return await response.clone().text();
  } catch {
    return "";
  }
}

/**
 * Handle an OpenAI-compatible moderations request (/v1/moderations).
 * Wraps the ported OmniRoute `handleModeration` core with API-key auth and the
 * credentialed provider fallback loop used by tts / embeddings / image handlers.
 *
 * The app-side services (auth + localDb) are imported lazily so this module stays
 * importable outside the Next.js bundler (which resolves the @/ alias); under the
 * bundler they resolve identically.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleModerationRequest(request) {
  const [{ getSettings }, auth] = await Promise.all([
    import("../../lib/localDb.js"),
    import("../services/auth.js"),
  ]);
  const {
    extractApiKey,
    isValidApiKey,
    getProviderCredentials,
    markAccountUnavailable,
  } = auth;

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
  log.request("POST", `${url.pathname} | moderation`);

  const settings = await getSettings();
  if (settings.requireApiKey) {
    const apiKey = extractApiKey(request);
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  if (!body.input) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: input");

  // Resolve the provider from the request: "provider/model" in the model field,
  // an explicit body.provider field, or the default moderation provider.
  const { provider: modelProvider } = parseModerationModel(typeof body.model === "string" ? body.model : "");
  const provider = modelProvider || body.provider || DEFAULT_MODERATION_PROVIDER;

  // handleModeration resolves its provider from the model string ("provider/model").
  // Normalize the model so bare model names (e.g. "omni-moderation-latest") work.
  const rawModel = body.model || DEFAULT_MODERATION_MODEL;
  const model = String(rawModel).includes("/") ? rawModel : `${provider}/${rawModel}`;
  const bodyForHandler = { ...body, model };

  // Credentialed providers — fallback loop (same pattern as tts / embeddings)
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
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    // handleModeration returns a Response directly (JSON 200 on success, errorResponse otherwise)
    const result = await handleModeration({ body: bodyForHandler, credentials, log });

    if (result instanceof Response) {
      if (result.status >= 200 && result.status < 300) return result;

      const errorText = await responseErrorText(result);
      const { shouldFallback } = await markAccountUnavailable(
        credentials.connectionId,
        result.status,
        errorText,
        provider,
        model
      );
      if (shouldFallback) {
        excludeConnectionIds.add(credentials.connectionId);
        lastError = errorText;
        lastStatus = result.status;
        continue;
      }
      return result;
    }

    // Object result shape: { success, status, error }
    if (result && result.success) {
      return result.response || new Response(JSON.stringify(result.data || {}), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    return errorResponse(result?.status || HTTP_STATUS.BAD_GATEWAY, result?.error || "Moderation failed");
  }
}
