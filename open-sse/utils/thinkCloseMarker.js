import { FORMATS } from "../translator/formats.js";
const THINKING_MARKER_HEADER = "x-omniroute-thinking-marker";
const SUPPRESS_THINK_CLOSE_UA_MARKERS = ["opencode", "antigravity"];
function shouldSuppressThinkCloseMarker(userAgent) {
  if (!userAgent || typeof userAgent !== "string") return false;
  const ua = userAgent.toLowerCase();
  return SUPPRESS_THINK_CLOSE_UA_MARKERS.some((marker) => ua.includes(marker));
}
function thinkingMarkerHeaderSignal(headerValue) {
  if (typeof headerValue !== "string") return null;
  const value = headerValue.trim().toLowerCase();
  if (value === "off" || value === "false" || value === "0" || value === "suppress") return true;
  if (value === "on" || value === "true" || value === "1" || value === "keep") return false;
  return null;
}
function resolveSuppressThinkClose(opts) {
  if (opts.clientResponseFormat === FORMATS.OPENAI_RESPONSES) return true;
  const headerSignal = thinkingMarkerHeaderSignal(opts.thinkingMarkerHeader);
  if (headerSignal !== null) return headerSignal;
  return true;
}
export {
  THINKING_MARKER_HEADER,
  resolveSuppressThinkClose,
  shouldSuppressThinkCloseMarker,
  thinkingMarkerHeaderSignal
};
