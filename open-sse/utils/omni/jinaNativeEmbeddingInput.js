const JINA_NATIVE_MEDIA_KEYS = ["text", "image", "audio", "video", "pdf"];
const NATIVE_KEY_TO_MODALITY = {
  text: "text",
  image: "image",
  audio: "audio",
  video: "video",
  pdf: "document"
};
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCanonicalEmbeddingItem(value) {
  return isPlainObject(value) && "type" in value && typeof value.type === "string";
}
function isJinaNativeDoc(value) {
  if (!isPlainObject(value) || isCanonicalEmbeddingItem(value)) return false;
  if ("content" in value && Array.isArray(value.content)) return false;
  const present = JINA_NATIVE_MEDIA_KEYS.filter((key) => key in value);
  if (present.length !== 1) return false;
  return typeof value[present[0]] === "string" && String(value[present[0]]).trim().length > 0;
}
function isJinaMergedContentGroup(value) {
  if (!isPlainObject(value) || isCanonicalEmbeddingItem(value)) return false;
  if (!Array.isArray(value.content) || value.content.length === 0) return false;
  return value.content.every((item) => isJinaNativeDoc(item) && !("pdf" in item));
}
function isJinaNativeEmbeddingItem(value) {
  return isJinaNativeDoc(value) || isJinaMergedContentGroup(value);
}
function isJinaNativeEmbeddingInput(input) {
  if (isJinaNativeEmbeddingItem(input)) return true;
  if (!Array.isArray(input)) return false;
  return input.some((item) => isJinaNativeEmbeddingItem(item));
}
function collectJinaNativeModalities(input) {
  const found = /* @__PURE__ */ new Set();
  const visit = (value) => {
    if (isJinaMergedContentGroup(value)) {
      for (const item of value.content) visit(item);
      return;
    }
    if (!isJinaNativeDoc(value)) return;
    const key = JINA_NATIVE_MEDIA_KEYS.find((mediaKey) => mediaKey in value);
    if (key) found.add(NATIVE_KEY_TO_MODALITY[key]);
  };
  if (Array.isArray(input)) {
    for (const item of input) visit(item);
  } else {
    visit(input);
  }
  return [...found];
}
export {
  JINA_NATIVE_MEDIA_KEYS,
  collectJinaNativeModalities,
  isCanonicalEmbeddingItem,
  isJinaMergedContentGroup,
  isJinaNativeDoc,
  isJinaNativeEmbeddingInput,
  isJinaNativeEmbeddingItem,
  isPlainObject
};
