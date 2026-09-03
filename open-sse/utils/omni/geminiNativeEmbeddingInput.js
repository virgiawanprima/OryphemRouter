import { isCanonicalEmbeddingItem, isPlainObject } from "./jinaNativeEmbeddingInput.js";
const GEMINI_EMBEDDING_2_IDS = /* @__PURE__ */ new Set(["gemini-embedding-2", "gemini-embedding-2-preview"]);
function isGeminiEmbedding2Family(modelId) {
  return typeof modelId === "string" && GEMINI_EMBEDDING_2_IDS.has(modelId);
}
function asRecord(value) {
  return isPlainObject(value) ? value : null;
}
function mimeFromInline(value) {
  const snake = asRecord(value.inline_data);
  if (typeof snake?.mime_type === "string") return snake.mime_type;
  const camel = asRecord(value.inlineData);
  if (typeof camel?.mimeType === "string") return camel.mimeType;
  return null;
}
function mimeFromFile(value) {
  const snake = asRecord(value.file_data);
  if (typeof snake?.mime_type === "string") return snake.mime_type;
  const camel = asRecord(value.fileData);
  if (typeof camel?.mimeType === "string") return camel.mimeType;
  return null;
}
function modalityFromGeminiMime(mimeType) {
  const mime = mimeType.trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf" || mime.startsWith("application/pdf")) return "document";
  return "document";
}
function isGeminiNativePart(value) {
  const record = asRecord(value);
  if (!record || isCanonicalEmbeddingItem(record)) return false;
  if (typeof record.text === "string" && record.text.trim().length > 0) {
    return !("image" in record) && !("audio" in record) && !("video" in record) && !("pdf" in record);
  }
  if (asRecord(record.inline_data)?.data || asRecord(record.inlineData)?.data) return true;
  if (asRecord(record.file_data)?.file_uri || asRecord(record.fileData)?.fileUri) return true;
  return false;
}
function isGeminiNativeContent(value) {
  const record = asRecord(value);
  if (!record || isCanonicalEmbeddingItem(record)) return false;
  if (!Array.isArray(record.parts) || record.parts.length === 0) return false;
  return record.parts.every((part) => isGeminiNativePart(part));
}
function isGeminiNativeEmbedRequest(value) {
  const record = asRecord(value);
  if (!record || isCanonicalEmbeddingItem(record)) return false;
  const content = record.content;
  if (Array.isArray(content)) return false;
  return isGeminiNativeContent(content);
}
function isGeminiNativeEmbeddingItem(value) {
  return isGeminiNativePart(value) || isGeminiNativeContent(value) || isGeminiNativeEmbedRequest(value);
}
function isGeminiNativeEmbeddingInput(input) {
  if (isGeminiNativeEmbeddingItem(input)) return true;
  if (!Array.isArray(input)) return false;
  return input.some((item) => isGeminiNativeEmbeddingItem(item));
}
function collectGeminiNativeModalities(input) {
  const found = /* @__PURE__ */ new Set();
  const visitPart = (value) => {
    const record = asRecord(value);
    if (!record) return;
    if (typeof record.text === "string" && record.text.trim().length > 0) found.add("text");
    const inlineMime = mimeFromInline(record);
    if (inlineMime) found.add(modalityFromGeminiMime(inlineMime));
    const fileMime = mimeFromFile(record);
    if (fileMime) found.add(modalityFromGeminiMime(fileMime));
  };
  const visit = (value) => {
    if (isGeminiNativeEmbedRequest(value)) {
      visit(value.content);
      return;
    }
    if (isGeminiNativeContent(value)) {
      for (const part of value.parts) visitPart(part);
      return;
    }
    if (isGeminiNativePart(value)) visitPart(value);
  };
  if (Array.isArray(input)) {
    for (const item of input) visit(item);
  } else {
    visit(input);
  }
  return [...found];
}
export {
  collectGeminiNativeModalities,
  isGeminiEmbedding2Family,
  isGeminiNativeContent,
  isGeminiNativeEmbedRequest,
  isGeminiNativeEmbeddingInput,
  isGeminiNativeEmbeddingItem,
  isGeminiNativePart,
  modalityFromGeminiMime
};
