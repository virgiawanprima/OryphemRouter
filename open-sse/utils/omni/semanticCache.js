// ADAPTED — graceful fallback (was @/lib/semanticCache).
// No-op in-memory semantic cache: reads miss, writes are discarded.
export function isCacheableForRead(_body, _headers) {
  return false;
}
export function isCacheableForWrite(_body, _headers) {
  return false;
}
export function generateSignature(_model, _messages, _temperature, _topP, _apiKeyId) {
  return "";
}
export function getCachedResponse(_signature) {
  return null;
}
export function setCachedResponse(_signature, _model, _response, _tokensSaved) {
  return undefined;
}