import { CORS_HEADERS } from "../utils/omni/cors.js";
import {
  getOcrProvider,
  getOcrTransformation,
  parseOcrModel,
  OCR_PROVIDERS
} from "../utils/omni/ocrRegistry.js";
import { errorResponse, redactSensitiveErrorText } from "../utils/errorSanitize.js";
import { log } from "../utils/log.js";
import { attachOmniRouteMetaHeaders } from "../utils/omni/omnirouteResponseMeta.js";
import { generateRequestId } from "../utils/omni/requestId.js";
import {
  getAccessToken,
  looksLikeServiceAccountJson,
  parseSAFromApiKey
} from "../utils/omni/vertexAuth.js";
const OCR_POLL_MAX_ATTEMPTS = 30;
const OCR_POLL_INTERVAL_MS = 1e3;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VERTEX_DEEPSEEK_OCR_PROVIDER_ID = "vertex-deepseek-ocr";
const VERTEX_OCR_DEFAULT_REGION = "us-central1";
function resolveVertexOcrProject(credentials) {
  const explicitProject = credentials.providerSpecificData?.project;
  if (typeof explicitProject === "string" && explicitProject.trim()) return explicitProject;
  if (credentials.apiKey && looksLikeServiceAccountJson(credentials.apiKey)) {
    try {
      const projectId = parseSAFromApiKey(credentials.apiKey).project_id;
      return typeof projectId === "string" && projectId.trim() ? projectId : null;
    } catch {
      return null;
    }
  }
  return null;
}
function resolveVertexOcrBaseUrl(credentials) {
  const project = resolveVertexOcrProject(credentials);
  if (!project) return null;
  const region = credentials.providerSpecificData?.region;
  const resolvedRegion = typeof region === "string" && region.trim() ? region : VERTEX_OCR_DEFAULT_REGION;
  return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${resolvedRegion}/endpoints/openapi/chat/completions`;
}
async function resolveVertexOcrAccessToken(providerId, credentials) {
  if (providerId !== VERTEX_DEEPSEEK_OCR_PROVIDER_ID) return credentials;
  if (credentials.accessToken || !credentials.apiKey) return credentials;
  if (!looksLikeServiceAccountJson(credentials.apiKey)) return credentials;
  const accessToken = await getAccessToken(parseSAFromApiKey(credentials.apiKey));
  return { ...credentials, accessToken };
}
async function handleOcr({
  body,
  credentials,
  fetchImpl = fetch,
  sleepImpl = defaultSleep
}) {
  const startTime = Date.now();
  if (!body.document) {
    return errorResponse(400, "document is required");
  }
  const model = body.model || "mistral-ocr-latest";
  const { provider: providerId, model: modelId } = parseOcrModel(model);
  const providerConfig = providerId ? getOcrProvider(providerId) : null;
  if (!providerConfig) {
    return errorResponse(
      400,
      `No OCR provider found for model "${model}". Available: ${Object.keys(OCR_PROVIDERS).join(", ")}`
    );
  }
  const token = credentials?.accessToken || credentials?.apiKey;
  if (!token) {
    return errorResponse(401, `No credentials for OCR provider: ${providerId}`);
  }
  const baseUrl = credentials?.baseUrl || providerConfig.baseUrl;
  if (!baseUrl) {
    return errorResponse(400, `No base URL configured for OCR provider: ${providerId}`);
  }
  try {
    const transformation = getOcrTransformation(providerId);
    const { url, init } = transformation.buildRequest({ baseUrl, token, body, modelId });
    const res = await fetchImpl(url, init);
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
    const pollUrl = transformation.pollUrl?.(res) ?? null;
    let data;
    if (pollUrl) {
      const authHeader = buildAuthHeader(providerConfig.authHeader, token);
      data = await pollOcrOperation({ pollUrl, authHeader, fetchImpl, sleepImpl });
      if (data instanceof Response) return data;
    } else {
      data = await res.json();
    }
    const parsed = transformation.parseResponse(data);
    const headers = new Headers({ ...CORS_HEADERS, "Content-Type": "application/json" });
    attachOmniRouteMetaHeaders(headers, {
      provider: providerId,
      model: modelId,
      costUsd: 0,
      latencyMs: Date.now() - startTime,
      requestId: generateRequestId()
    });
    return new Response(JSON.stringify(parsed), { status: 200, headers });
  } catch (err) {
    log.error("OCR", err);
    return errorResponse(500, "OCR request failed");
  }
}
function buildAuthHeader(authHeader, token) {
  if (authHeader === "bearer") {
    return { Authorization: `Bearer ${token}` };
  }
  return { [authHeader]: token };
}
async function pollOcrOperation({ pollUrl, authHeader, fetchImpl, sleepImpl }) {
  for (let attempt = 0; attempt < OCR_POLL_MAX_ATTEMPTS; attempt++) {
    await sleepImpl(OCR_POLL_INTERVAL_MS);
    const pollRes = await fetchImpl(pollUrl, {
      method: "GET",
      headers: authHeader
    });
    if (!pollRes.ok) {
      log.error("OCR", "poll error", pollRes.status);
      return errorResponse(502, "OCR analysis failed");
    }
    const json = await pollRes.json();
    if (json.status === "succeeded") {
      return json;
    }
    if (json.status === "failed") {
      return errorResponse(502, "OCR analysis failed");
    }
  }
  return errorResponse(504, "OCR analysis timed out");
}
export {
  VERTEX_DEEPSEEK_OCR_PROVIDER_ID,
  handleOcr,
  resolveVertexOcrAccessToken,
  resolveVertexOcrBaseUrl
};
