import { stripTrailingSlashes } from "../utils/urlSanitize.js";
const MARITALK_DEFAULT_BASE_URL = "https://chat.maritaca.ai/api";
function normalizeMaritalkBaseUrl(value) {
  const normalized = stripTrailingSlashes((value || MARITALK_DEFAULT_BASE_URL).trim());
  if (!normalized) return MARITALK_DEFAULT_BASE_URL;
  return normalized.replace(/\/chat\/(?:completions|inference)$/i, "");
}
function buildMaritalkChatUrl(value) {
  return `${normalizeMaritalkBaseUrl(value)}/chat/completions`;
}
function buildMaritalkModelsUrl(value) {
  return `${normalizeMaritalkBaseUrl(value)}/models`;
}
export {
  MARITALK_DEFAULT_BASE_URL,
  buildMaritalkChatUrl,
  buildMaritalkModelsUrl,
  normalizeMaritalkBaseUrl
};
