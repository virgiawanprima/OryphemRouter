import { HTTP_STATUS } from "../../config/constants.js";
function isSelfInflictedUpstreamTimeout(status, errorType, provider) {
  return status === HTTP_STATUS.GATEWAY_TIMEOUT && errorType === "upstream_timeout" && provider !== "antigravity";
}
export {
  isSelfInflictedUpstreamTimeout
};
