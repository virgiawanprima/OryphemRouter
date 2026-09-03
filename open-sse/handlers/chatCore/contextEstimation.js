import { adaptBodyForCompression } from "../../services/compression/bodyAdapter.js";
import { estimateTokens } from "../../services/contextManager.js";
function asJsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function estimateFinalInputTokens(requestBody) {
  const adapted = requestBody ? adaptBodyForCompression(requestBody).body : null;
  const nestedRequest = asJsonRecord(requestBody?.request);
  const messages = adapted?.messages || requestBody?.contents || nestedRequest?.contents || (Array.isArray(requestBody?.input) ? requestBody.input : requestBody?.input && typeof requestBody.input === "object" ? requestBody.input : []);
  return estimateTokens(messages) + (Array.isArray(requestBody?.tools) ? estimateTokens(requestBody.tools) : 0) + estimateTokens(requestBody?.system) + estimateTokens(requestBody?.instructions);
}
export {
  estimateFinalInputTokens
};
