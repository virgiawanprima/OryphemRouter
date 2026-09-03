import { CORS_HEADERS } from "../utils/omni/cors.js";
import { getModerationProvider, parseModerationModel } from "../utils/omni/moderationRegistry.js";
import { errorResponse, redactSensitiveErrorText } from "../utils/errorSanitize.js";
import { attachOmniRouteMetaHeaders } from "../utils/omni/omnirouteResponseMeta.js";
import { generateRequestId } from "../utils/omni/requestId.js";
async function handleModeration({ body, credentials }) {
  const startTime = Date.now();
  if (!body.input) {
    return errorResponse(400, "input is required");
  }
  const model = body.model || "omni-moderation-latest";
  const { provider: providerId, model: modelId } = parseModerationModel(model);
  const providerConfig = providerId ? getModerationProvider(providerId) : null;
  if (!providerConfig) {
    return errorResponse(
      400,
      `No moderation provider found for model "${model}". Available: openai`
    );
  }
  const token = credentials?.apiKey || credentials?.accessToken;
  if (!token) {
    return errorResponse(401, `No credentials for moderation provider: ${providerId}`);
  }
  try {
    const res = await fetch(providerConfig.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model: modelId,
        input: body.input
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      return new Response(redactSensitiveErrorText(errText), {
        status: res.status,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
    const data = await res.json();
    const headers = new Headers({ ...CORS_HEADERS, "Content-Type": "application/json" });
    attachOmniRouteMetaHeaders(headers, {
      provider: providerId,
      model: modelId,
      costUsd: 0,
      latencyMs: Date.now() - startTime,
      requestId: generateRequestId()
    });
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (err) {
    return errorResponse(500, `Moderation request failed: ${err.message}`);
  }
}
export {
  handleModeration
};
