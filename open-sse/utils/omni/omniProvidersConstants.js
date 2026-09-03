// unified by integration — canonical definitions live in ./providerRegistry.js
// (omniProvidersConstants.js was a parallel port of OmniRoute
// @/shared/constants/providers; now re-exports the unified facade).
export {
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
  isOpenAiCompatibleProvider,
  isAnthropicCompatibleProvider,
} from "./providerRegistry.js";
