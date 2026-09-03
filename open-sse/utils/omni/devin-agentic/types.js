class DevinAgenticBridgeError extends Error {
  status;
  code;
  constructor(message, code = "devin_agentic_error", status = 400) {
    super(message);
    this.name = "DevinAgenticBridgeError";
    this.code = code;
    this.status = status;
  }
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}
export {
  DevinAgenticBridgeError,
  asRecord,
  estimateTokens
};
