import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
function formatSearchProviderFailure(providerId, err, isTimeout) {
  const rec = err && typeof err === "object" ? err : {};
  const cause = rec.cause && typeof rec.cause === "object" ? rec.cause : {};
  const code = typeof cause.code === "string" && /^[A-Z][A-Z0-9_]{1,39}$/.test(cause.code) ? cause.code : "";
  const msg = sanitizeErrorMessage(typeof rec.message === "string" ? rec.message : "fetch failed") || "fetch failed";
  return {
    success: false,
    status: isTimeout ? 504 : 502,
    error: `Search provider ${providerId} ${isTimeout ? "timeout" : "error"}: ${code ? `${msg} (cause: ${code})` : msg}`
  };
}
export {
  formatSearchProviderFailure
};
