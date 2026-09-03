import { CORS_HEADERS } from "../utils/omni/cors.js";
import { getRerankProvider, parseRerankModel, RERANK_PROVIDERS } from "../utils/omni/rerankRegistry.js";
import { errorResponse } from "../utils/errorSanitize.js";
import { attachOmniRouteMetaHeaders } from "../utils/omni/omnirouteResponseMeta.js";
import { calculateModalCost } from "../utils/omni/costCalculator.js";
import { generateRequestId } from "../utils/omni/requestId.js";
import { saveCallLog } from "../utils/omni/usageDb.js";
import { resolveProxyForConnection } from "../utils/omni/dbSettingsProxy.js";
import { runWithProxyContext } from "../utils/omni/proxyFetchExtras.js";
import * as log from "../utils/omni/logger.js";
function buildAuthHeader(providerConfig, token) {
  if (providerConfig.authHeader === "bearer") {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
function transformRequestForProvider(providerConfig, body) {
  if (providerConfig.format === "nvidia") {
    return {
      model: body.model,
      query: { text: body.query },
      passages: (body.documents || []).map((doc) => ({
        text: typeof doc === "string" ? doc : doc.text || ""
      })),
      top_n: body.top_n
    };
  }
  if (providerConfig.format === "deepinfra") {
    return {
      queries: [body.query],
      documents: (body.documents || []).map(
        (doc) => typeof doc === "string" ? doc : doc.text || ""
      )
    };
  }
  if (providerConfig.format === "voyage") {
    const docTexts = (body.documents || []).map((doc) => typeof doc === "string" ? doc : doc?.text || "").filter((text) => text !== "");
    return {
      model: body.model,
      query: body.query,
      documents: docTexts,
      top_k: body.top_n || docTexts.length,
      return_documents: false
    };
  }
  return body;
}
function transformResponseFromProvider(providerConfig, data, options = {}) {
  if (providerConfig.format === "nvidia") {
    return {
      id: data.id != null ? String(data.id) : `rerank-${Date.now()}`,
      results: (data.rankings || []).map((r) => ({
        index: r.index,
        relevance_score: r.logit || r.score || 0,
        document: { text: r.text || "" }
      })),
      meta: {
        api_version: { version: "2" },
        billed_units: { search_units: 1 }
      }
    };
  }
  if (providerConfig.format === "deepinfra") {
    const documents = Array.isArray(options.documents) ? options.documents : [];
    const returnDocuments = options.return_documents !== false;
    const scored = (Array.isArray(data.scores) ? data.scores : []).map((score, index) => {
      const doc = documents[index];
      const text = typeof doc === "string" ? doc : doc?.text || "";
      return {
        index,
        relevance_score: typeof score === "number" ? score : 0,
        ...returnDocuments ? { document: { text } } : {}
      };
    });
    scored.sort((a, b) => b.relevance_score - a.relevance_score);
    const topN = typeof options.top_n === "number" && options.top_n > 0 ? options.top_n : void 0;
    return {
      id: `rerank-${Date.now()}`,
      results: topN ? scored.slice(0, topN) : scored,
      meta: {
        api_version: { version: "2" },
        billed_units: { search_units: 1 }
      }
    };
  }
  if (providerConfig.format === "voyage") {
    const documents = Array.isArray(options.documents) ? options.documents : [];
    const returnDocuments = options.return_documents !== false;
    const indexMap = [];
    documents.forEach((doc, i) => {
      const text = typeof doc === "string" ? doc : doc?.text || "";
      if (text !== "") indexMap.push(i);
    });
    const scored = (Array.isArray(data.data) ? data.data : []).map((entry) => {
      const filteredIdx = entry.index ?? 0;
      const originalIdx = indexMap[filteredIdx] ?? filteredIdx;
      const doc = documents[originalIdx];
      const text = typeof doc === "string" ? doc : doc?.text || "";
      return {
        index: originalIdx,
        relevance_score: typeof entry.relevance_score === "number" ? entry.relevance_score : 0,
        ...returnDocuments ? { document: { text } } : {}
      };
    });
    scored.sort((a, b) => b.relevance_score - a.relevance_score);
    const topN = typeof options.top_n === "number" && options.top_n > 0 ? options.top_n : void 0;
    return {
      id: `rerank-${Date.now()}`,
      results: topN ? scored.slice(0, topN) : scored,
      meta: {
        api_version: { version: "2" },
        billed_units: { search_units: 1 }
      }
    };
  }
  return data;
}
async function handleRerank({
  model,
  query,
  documents,
  top_n,
  return_documents,
  credentials,
  connectionId = null,
  apiKeyId = null,
  apiKeyName = null
}) {
  const startTime = Date.now();
  if (!model) return errorResponse(400, "model is required");
  if (!query) return errorResponse(400, "query is required");
  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    return errorResponse(400, "documents must be a non-empty array");
  }
  const { provider: providerId, model: modelId } = parseRerankModel(model);
  const providerConfig = providerId ? getRerankProvider(providerId) : null;
  if (!providerConfig) {
    const availableProviders = Object.keys(RERANK_PROVIDERS).join(", ");
    return errorResponse(
      400,
      `No rerank provider found for model "${model}". Available: ${availableProviders}`
    );
  }
  const token = credentials?.apiKey || credentials?.accessToken;
  if (!token) {
    return errorResponse(401, `No credentials for rerank provider: ${providerId}`);
  }
  const requestBody = transformRequestForProvider(providerConfig, {
    model: modelId,
    query,
    documents,
    top_n: top_n || documents.length,
    return_documents: return_documents !== false
  });
  const rerankUrl = providerConfig.format === "deepinfra" ? `${providerConfig.baseUrl}/${modelId}` : providerConfig.baseUrl;
  let proxyInfo = null;
  if (connectionId) {
    try {
      proxyInfo = await resolveProxyForConnection(connectionId);
    } catch (err) {
      log.error("RERANK", `Proxy resolution failed for connection ${connectionId}: ${err}`);
    }
  }
  const doFetch = () => fetch(rerankUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeader(providerConfig, token)
    },
    body: JSON.stringify(requestBody)
  });
  try {
    const res = connectionId ? await runWithProxyContext(proxyInfo?.proxy || null, doFetch) : await doFetch();
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errorMessage = errData.message || errData.error?.message || `Provider returned HTTP ${res.status}`;
      saveCallLog({
        method: "POST",
        path: "/v1/rerank",
        status: res.status,
        model: `${providerId}/${modelId}`,
        provider: providerId,
        connectionId: connectionId || void 0,
        duration: Date.now() - startTime,
        requestBody,
        responseBody: errData,
        error: errorMessage,
        apiKeyId: apiKeyId || void 0,
        apiKeyName: apiKeyName || void 0
      }).catch(() => {
      });
      return errorResponse(res.status, errorMessage);
    }
    const data = await res.json();
    const result = transformResponseFromProvider(providerConfig, data, {
      documents,
      top_n: top_n || documents.length,
      return_documents
    });
    const searchUnits = Number(result?.meta?.billed_units?.search_units) || 0;
    const costUsd = await calculateModalCost("rerank", providerId, modelId, { searchUnits });
    saveCallLog({
      method: "POST",
      path: "/v1/rerank",
      status: 200,
      model: `${providerId}/${modelId}`,
      provider: providerId,
      connectionId: connectionId || void 0,
      duration: Date.now() - startTime,
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      requestBody,
      responseBody: result,
      apiKeyId: apiKeyId || void 0,
      apiKeyName: apiKeyName || void 0
    }).catch(() => {
    });
    const headers = new Headers({ ...CORS_HEADERS, "Content-Type": "application/json" });
    attachOmniRouteMetaHeaders(headers, {
      provider: providerId,
      model: modelId,
      costUsd,
      latencyMs: Date.now() - startTime,
      requestId: generateRequestId()
    });
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (err) {
    return errorResponse(500, `Rerank request failed: ${err.message}`);
  }
}
export {
  handleRerank,
  transformRequestForProvider,
  transformResponseFromProvider
};
