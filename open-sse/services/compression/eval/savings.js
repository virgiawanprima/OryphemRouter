import { estimateCompressionTokens } from "../stats.js";
function computeSavings(fullBody, compressedBody, costPerKTokenIn) {
  const tokensBefore = estimateCompressionTokens(fullBody);
  const tokensAfter = estimateCompressionTokens(compressedBody);
  const ratio = tokensBefore > 0 ? Math.round(tokensAfter / tokensBefore * 1e4) / 1e4 : 1;
  const result = { tokensBefore, tokensAfter, ratio };
  if (typeof costPerKTokenIn === "number" && costPerKTokenIn > 0) {
    const saved = (tokensBefore - tokensAfter) / 1e3 * costPerKTokenIn;
    result.costDelta = Math.round(saved * 1e6) / 1e6;
  }
  return result;
}
export {
  computeSavings
};
