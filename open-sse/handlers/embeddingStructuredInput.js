import { MAX_EMBEDDING_INLINE_TOTAL_BYTES } from "../utils/omni/apiV1Schema.js";
import {
  isCanonicalEmbeddingItem,
  isJinaMergedContentGroup,
  isJinaNativeDoc,
  isJinaNativeEmbeddingItem,
  isPlainObject
} from "../utils/omni/jinaNativeEmbeddingInput.js";
import {
  isGeminiNativeContent,
  isGeminiNativeEmbedRequest,
  isGeminiNativePart
} from "../utils/omni/geminiNativeEmbeddingInput.js";
const AGGREGATE_SIZE_ERROR = "decoded inline media must not exceed 16 MiB per request";
function isStructuredItem(value) {
  return typeof value === "object" && value !== null && "type" in value;
}
function hasStructuredEmbeddingInput(input) {
  return Array.isArray(input) && input.some(isStructuredItem);
}
async function sourceToInlineData(item, fetchMedia) {
  if (item.source.type === "base64") {
    return { data: item.source.data, mediaType: item.source.media_type };
  }
  const fetched = await fetchMedia(item.source.url);
  if (!fetched.contentType) {
    throw new Error("Remote embedding media must include a Content-Type header");
  }
  return { data: fetched.buffer.toString("base64"), mediaType: fetched.contentType };
}
async function resolveInlineItems(items, fetchMedia) {
  const results = [];
  let remainingBytes = MAX_EMBEDDING_INLINE_TOTAL_BYTES;
  for (const item of items) {
    if (item.type === "text") {
      results.push({ item, inline: null });
      continue;
    }
    if (item.source.type === "url" && remainingBytes <= 0) {
      throw new Error(AGGREGATE_SIZE_ERROR);
    }
    const { data, mediaType } = await sourceToInlineData(item, fetchMedia);
    const decodedBytes = Buffer.byteLength(data, "base64");
    if (decodedBytes > remainingBytes) {
      throw new Error(AGGREGATE_SIZE_ERROR);
    }
    remainingBytes -= decodedBytes;
    results.push({ item, inline: { data, mediaType } });
  }
  return results;
}
async function prepareJinaInput(items, fetchMedia) {
  const resolved = await resolveInlineItems(items, fetchMedia);
  return resolved.map(({ item, inline }) => {
    if (item.type === "text") return { text: item.text };
    const key = item.type === "document" ? "pdf" : item.type;
    return { [key]: `data:${inline.mediaType};base64,${inline.data}` };
  });
}
async function prepareJinaMixedEmbeddingInput(input, fetchMedia) {
  const out = [];
  for (const item of input) {
    if (typeof item === "string" || isJinaNativeEmbeddingItem(item)) {
      out.push(item);
      continue;
    }
    if (isCanonicalEmbeddingItem(item)) {
      const [translated] = await prepareJinaInput(
        [item],
        fetchMedia
      );
      out.push(translated);
      continue;
    }
    out.push(item);
  }
  return out;
}
function mapGeminiTaskType(value) {
  if (value === "retrieval.query") return "RETRIEVAL_QUERY";
  if (value === "retrieval.passage") return "RETRIEVAL_DOCUMENT";
  return value;
}
function geminiNativeUrl(model, method) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}`;
}
function geminiRequestExtras(body) {
  const extras = {};
  if (body.dimensions !== void 0) extras.output_dimensionality = body.dimensions;
  if (body.task !== void 0) extras.task_type = mapGeminiTaskType(body.task);
  return extras;
}
function embeddingValues(entry) {
  if (!entry || typeof entry !== "object") return [];
  const values = entry.values;
  return Array.isArray(values) ? values : [];
}
function normalizeGeminiEmbedContentResponse(data) {
  return {
    object: "list",
    data: [{ object: "embedding", embedding: embeddingValues(data.embedding), index: 0 }],
    usage: { prompt_tokens: 0, total_tokens: 0 }
  };
}
function normalizeGeminiBatchResponse(data) {
  const embeddings = Array.isArray(data.embeddings) ? data.embeddings : [];
  return {
    object: "list",
    data: embeddings.map((entry, index) => ({
      object: "embedding",
      embedding: embeddingValues(entry),
      index
    })),
    usage: { prompt_tokens: 0, total_tokens: 0 }
  };
}
function dataUriToInlineData(value) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(value.trim());
  if (!match) return null;
  return { mime_type: match[1], data: match[2] };
}
async function mediaStringToGeminiPart(raw, fallbackMime, fetchMedia) {
  const trimmed = raw.trim();
  const fromDataUri = dataUriToInlineData(trimmed);
  if (fromDataUri) return { inline_data: fromDataUri };
  if (/^https:\/\//i.test(trimmed)) {
    const fetched = await fetchMedia(trimmed);
    if (!fetched.contentType) {
      throw new Error("Remote embedding media must include a Content-Type header");
    }
    return {
      inline_data: {
        mime_type: fetched.contentType,
        data: fetched.buffer.toString("base64")
      }
    };
  }
  return { inline_data: { mime_type: fallbackMime, data: trimmed } };
}
async function jinaDocToGeminiPart(item, fetchMedia) {
  if (typeof item.text === "string") return { text: item.text };
  if (typeof item.image === "string") {
    return mediaStringToGeminiPart(item.image, "image/png", fetchMedia);
  }
  if (typeof item.audio === "string") {
    return mediaStringToGeminiPart(item.audio, "audio/mpeg", fetchMedia);
  }
  if (typeof item.video === "string") {
    return mediaStringToGeminiPart(item.video, "video/mp4", fetchMedia);
  }
  if (typeof item.pdf === "string") {
    return mediaStringToGeminiPart(item.pdf, "application/pdf", fetchMedia);
  }
  throw new Error("Unsupported Jina-native embedding item for Gemini");
}
async function itemToGeminiContent(item, fetchMedia) {
  if (typeof item === "string") return { parts: [{ text: item }] };
  if (isGeminiNativeEmbedRequest(item)) {
    return item.content;
  }
  if (isGeminiNativeContent(item)) {
    return item;
  }
  if (isGeminiNativePart(item)) {
    return { parts: [item] };
  }
  if (isJinaMergedContentGroup(item)) {
    const parts = [];
    for (const chunk of item.content) {
      if (isPlainObject(chunk)) parts.push(await jinaDocToGeminiPart(chunk, fetchMedia));
    }
    return { parts };
  }
  if (isJinaNativeDoc(item) && isPlainObject(item)) {
    return { parts: [await jinaDocToGeminiPart(item, fetchMedia)] };
  }
  if (isCanonicalEmbeddingItem(item)) {
    const [part] = await prepareGeminiParts(
      [item],
      fetchMedia
    );
    return { parts: [part] };
  }
  throw new Error("Unsupported Gemini embedding input item");
}
async function prepareGeminiParts(items, fetchMedia) {
  const resolved = await resolveInlineItems(items, fetchMedia);
  return resolved.map(({ item, inline }) => {
    if (item.type === "text") return { text: item.text };
    return { inline_data: { mime_type: inline.mediaType, data: inline.data } };
  });
}
function normalizeEmbeddingInputItems(input) {
  if (Array.isArray(input)) return input;
  if (input === void 0 || input === null) return [];
  return [input];
}
async function prepareStructuredEmbeddingRequest(provider, model, body, token, options) {
  const items = normalizeEmbeddingInputItems(body.input);
  if (provider.structuredInputProtocol === "jina-v1") {
    return {
      url: provider.baseUrl,
      body: {
        ...body,
        model,
        input: await prepareJinaInput(items, options.fetchMedia)
      }
    };
  }
  if (provider.structuredInputProtocol === "gemini-embed-content") {
    const contents = [];
    for (const item of items) {
      contents.push(await itemToGeminiContent(item, options.fetchMedia));
    }
    if (contents.length === 0) {
      throw new Error("Gemini embedding input must contain at least one item");
    }
    const extras = geminiRequestExtras(body);
    const authHeader = { name: "x-goog-api-key", value: token };
    if (contents.length === 1) {
      return {
        url: geminiNativeUrl(model, "embedContent"),
        body: { content: contents[0], ...extras },
        authHeader,
        normalizeResponse: normalizeGeminiEmbedContentResponse
      };
    }
    return {
      url: geminiNativeUrl(model, "batchEmbedContents"),
      body: {
        requests: contents.map((content) => ({
          model: `models/${model}`,
          content,
          ...extras
        }))
      },
      authHeader,
      normalizeResponse: normalizeGeminiBatchResponse
    };
  }
  throw new Error(`Provider ${provider.id} has no structured embedding input translator`);
}
export {
  hasStructuredEmbeddingInput,
  prepareJinaMixedEmbeddingInput,
  prepareStructuredEmbeddingRequest
};
