import {
  getTranslationProvider,
  parseTranslationModel
} from "../utils/omni/audioRegistry.js";
import { buildAuthHeaders } from "../utils/omni/registryUtils.js";
import { buildMultipartBody } from "./audioTranscription.js";
import { errorResponse } from "../utils/errorSanitize.js";
function extractUpstreamErrorMessage(errText, status) {
  try {
    const parsed = JSON.parse(errText);
    const raw = parsed?.error?.message || (typeof parsed?.error === "string" ? parsed.error : null) || parsed?.message || null;
    return raw ? String(raw) : errText || `Upstream error (${status})`;
  } catch {
    return errText || `Upstream error (${status})`;
  }
}
async function handleAudioTranslation({
  formData,
  credentials,
  resolvedProvider = null,
  resolvedModel = null
}) {
  const model = formData.get("model");
  if (typeof model !== "string" || !model) {
    return errorResponse(400, "model is required");
  }
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof Blob)) {
    return errorResponse(400, "file is required");
  }
  const file = fileEntry;
  let providerConfig = resolvedProvider;
  let modelId = resolvedModel;
  if (!providerConfig) {
    const parsed = parseTranslationModel(model);
    providerConfig = parsed.provider ? getTranslationProvider(parsed.provider) : null;
    modelId = parsed.model;
  }
  if (!providerConfig) {
    return errorResponse(
      400,
      `No translation provider found for model "${model}". Available: openai, groq`
    );
  }
  const token = providerConfig.authType === "none" ? null : credentials?.apiKey || credentials?.accessToken;
  if (providerConfig.authType !== "none" && !token) {
    return errorResponse(401, `No credentials for translation provider: ${providerConfig.id}`);
  }
  const extraFields = {};
  for (const key of ["prompt", "response_format", "temperature"]) {
    const val = formData.get(key);
    if (val !== null && val !== void 0) {
      extraFields[key] = String(val);
    }
  }
  const { body: multipartBody, contentType: multipartCT } = await buildMultipartBody(file, {
    model: modelId,
    ...extraFields
  });
  try {
    const res = await fetch(providerConfig.baseUrl, {
      method: "POST",
      headers: { ...buildAuthHeaders(providerConfig, token), "Content-Type": multipartCT },
      body: multipartBody
    });
    if (!res.ok) {
      const errText = await res.text();
      return errorResponse(res.status, extractUpstreamErrorMessage(errText, res.status));
    }
    const data = await res.text();
    const respContentType = res.headers.get("content-type") || "application/json";
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": respContentType }
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return errorResponse(500, `Translation request failed: ${error.message}`);
  }
}
export {
  handleAudioTranslation
};
