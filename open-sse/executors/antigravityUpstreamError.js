import { buildErrorBody } from "../utils/errorSanitize.js";
import { isGeoBlockedError } from "../utils/omni/errorClassifier.js";
const GEO_BLOCKED_HINT = `The Cloud Code API is not offered from this server's current egress location ("User location is not supported for the API use."). This is not an account problem: the connection test only validates the Google OAuth token and does not call the model API. Route antigravity/agy egress through a proxy in a supported region (e.g. US/EU) or use a different provider.`;
function buildAntigravityUpstreamError(status, statusText, rawBody) {
  let upstreamDetails;
  try {
    upstreamDetails = JSON.parse(rawBody);
  } catch {
  }
  const suffix = statusText ? `: ${statusText}` : "";
  if (isGeoBlockedError(rawBody)) {
    return buildErrorBody(
      status,
      `Antigravity upstream error (${status})${suffix}. ${GEO_BLOCKED_HINT}`,
      upstreamDetails
    );
  }
  return buildErrorBody(status, `Antigravity upstream error (${status})${suffix}`, upstreamDetails);
}
export {
  buildAntigravityUpstreamError
};
