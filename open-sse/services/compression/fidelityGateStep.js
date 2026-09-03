import { extractTextContent } from "./messageContent.js";
import { checkFidelity } from "./fidelityGate.js";
import { getCompressionEngine } from "./engines/registry.js";
function bodyToText(body) {
  const messages = body.messages;
  if (!Array.isArray(messages)) return "";
  return messages.map((m) => extractTextContent(m.content)).join("\n");
}
function gateAdvance(result, inputBody, fidelityGate, acc, engineId) {
  if (!fidelityGate?.enabled) return true;
  if (engineId && getCompressionEngine(engineId)?.sampling) return true;
  const verdict = checkFidelity(bodyToText(inputBody), bodyToText(result.body), fidelityGate);
  if (verdict.passed) return true;
  if (result.stats) {
    const last = acc.breakdown[acc.breakdown.length - 1];
    if (last) {
      last.rejected = true;
      last.rejectReason = verdict.detail ?? verdict.failedInvariant;
      last.compressedTokens = last.originalTokens;
      last.savingsPercent = 0;
    }
  }
  acc.fallbackApplied = true;
  return false;
}
export {
  gateAdvance
};
