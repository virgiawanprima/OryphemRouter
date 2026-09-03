const MISTRAL_PASSTHROUGH = {
  buildRequest({ baseUrl, token, body, modelId }) {
    return {
      url: baseUrl,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, model: modelId })
      }
    };
  },
  parseResponse(raw) {
    return raw;
  }
};
function getOcrTransformation(providerId) {
  return OCR_PROVIDERS[providerId]?.transformation ?? MISTRAL_PASSTHROUGH;
}
const AZURE_DI_API_VERSION = "2024-11-30";
function azureDiSource(document) {
  if (!document) return {};
  const url = String(document.document_url ?? document.image_url ?? "");
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    return { base64Source: comma >= 0 ? url.slice(comma + 1) : "" };
  }
  return url ? { urlSource: url } : {};
}
const AZURE_DI_TRANSFORMATION = {
  buildRequest({ baseUrl, token, body, modelId }) {
    const root = baseUrl.replace(/\/+$/, "");
    return {
      url: `${root}/documentintelligence/documentModels/${modelId}:analyze?api-version=${AZURE_DI_API_VERSION}&outputContentFormat=markdown`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": token },
        body: JSON.stringify(azureDiSource(body.document))
      }
    };
  },
  pollUrl(res) {
    return res.headers.get("Operation-Location");
  },
  parseResponse(raw) {
    const r = raw;
    const pageCount = r.analyzeResult?.pages?.length ?? 1;
    return {
      pages: [{ index: 0, markdown: r.analyzeResult?.content ?? "" }],
      model: "prebuilt-read",
      usage_info: { pages_processed: pageCount }
    };
  }
};
function vertexDeepseekOcrContent(document) {
  const url = String(document?.document_url ?? document?.image_url ?? "");
  return { type: "image_url", image_url: url };
}
const VERTEX_DEEPSEEK_TRANSFORMATION = {
  buildRequest({ baseUrl, token, body, modelId }) {
    return {
      url: baseUrl,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: `deepseek-ai/${modelId}`,
          messages: [
            {
              role: "user",
              content: [vertexDeepseekOcrContent(body.document)]
            }
          ]
        })
      }
    };
  },
  parseResponse(raw) {
    const r = raw;
    const model = r.model ?? "deepseek-ocr-maas";
    const content = r.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      const trimmed = content.trim();
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed.pages)) {
            return {
              pages: parsed.pages,
              model: parsed.model ?? model,
              usage_info: parsed.usage_info ?? r.usage
            };
          }
        } catch {
        }
      }
      return { pages: [{ index: 0, markdown: content }], model, usage_info: r.usage };
    }
    return { pages: [{ index: 0, markdown: "" }], model, usage_info: r.usage };
  }
};
const OCR_PROVIDERS = {
  mistral: {
    id: "mistral",
    baseUrl: "https://api.mistral.ai/v1/ocr",
    authType: "apikey",
    authHeader: "bearer",
    models: [{ id: "mistral-ocr-latest", name: "Mistral OCR" }]
  },
  "azure-document-intelligence": {
    id: "azure-document-intelligence",
    baseUrl: "",
    authType: "apikey",
    authHeader: "Ocp-Apim-Subscription-Key",
    models: [{ id: "prebuilt-read", name: "Azure Document Intelligence (Read)" }],
    transformation: AZURE_DI_TRANSFORMATION
  },
  "vertex-deepseek-ocr": {
    id: "vertex-deepseek-ocr",
    baseUrl: "",
    authType: "apikey",
    authHeader: "bearer",
    models: [{ id: "deepseek-ocr-maas", name: "DeepSeek OCR (Vertex AI MaaS)" }],
    transformation: VERTEX_DEEPSEEK_TRANSFORMATION
  }
};
function getOcrProvider(providerId) {
  return OCR_PROVIDERS[providerId] || null;
}
function parseOcrModel(modelStr) {
  if (!modelStr) return { provider: null, model: null };
  for (const providerId of Object.keys(OCR_PROVIDERS)) {
    if (modelStr.startsWith(providerId + "/")) {
      return { provider: providerId, model: modelStr.slice(providerId.length + 1) };
    }
  }
  for (const [providerId, config] of Object.entries(OCR_PROVIDERS)) {
    if (config.models.some((m) => m.id === modelStr)) {
      return { provider: providerId, model: modelStr };
    }
  }
  return { provider: null, model: modelStr };
}
function getAllOcrModels() {
  const models = [];
  for (const [providerId, config] of Object.entries(OCR_PROVIDERS)) {
    for (const model of config.models) {
      models.push({
        id: `${providerId}/${model.id}`,
        name: model.name,
        provider: providerId
      });
    }
  }
  return models;
}
export {
  AZURE_DI_TRANSFORMATION,
  MISTRAL_PASSTHROUGH,
  OCR_PROVIDERS,
  VERTEX_DEEPSEEK_TRANSFORMATION,
  getAllOcrModels,
  getOcrProvider,
  getOcrTransformation,
  parseOcrModel
};
