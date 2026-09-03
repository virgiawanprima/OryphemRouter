import { OPENAI_COMPATIBLE_PREFIX, ANTHROPIC_COMPATIBLE_PREFIX } from "./omniProvidersConstants.js";
const COMPATIBLE_PROVIDER_ID_PATTERN = new RegExp(
  `^(?:${OPENAI_COMPATIBLE_PREFIX}(?:chat|responses)-|${ANTHROPIC_COMPATIBLE_PREFIX}(?:cc-)?)[0-9a-f-]+$`,
  "i"
);
function isCompatibleProviderConnectionId(providerId) {
  return typeof providerId === "string" && COMPATIBLE_PROVIDER_ID_PATTERN.test(providerId);
}
export {
  isCompatibleProviderConnectionId
};
