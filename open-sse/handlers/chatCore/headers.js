function getHeaderValueCaseInsensitive(headers, targetName) {
  if (!headers || typeof headers !== "object") return null;
  if (headers instanceof Headers) {
    return headers.get(targetName);
  }
  const lowered = targetName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowered && typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
function isNoMemoryRequested(headers) {
  const value = (getHeaderValueCaseInsensitive(headers, "x-omniroute-no-memory") || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
function resolveCompressionHeader(headers) {
  const value = (getHeaderValueCaseInsensitive(headers, "x-omniroute-compression") || "").trim();
  return value || null;
}
function isStripReasoningRequested(headers) {
  const value = (getHeaderValueCaseInsensitive(headers, "x-omniroute-strip-reasoning") || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
export {
  getHeaderValueCaseInsensitive,
  isNoMemoryRequested,
  isStripReasoningRequested,
  resolveCompressionHeader
};
