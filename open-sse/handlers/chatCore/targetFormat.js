import { PROVIDER_ID_TO_ALIAS, getModelTargetFormat } from "../../config/providerModels.js";
import { getRegistryEntry } from "../../utils/omni/providerRegistryStub.js";
import { resolveAlternateFormat } from "../../utils/omni/alternateFormats.js";
import { getTargetFormat } from "../../services/provider.js";
import { FORMATS } from "../../translator/formats.js";
function resolveChatCoreTargetFormat(opts) {
  const {
    provider,
    resolvedModel,
    apiFormat,
    sourceFormat,
    customModelTargetFormat,
    providerSpecificData,
    nativeXaiResponsesPassthrough = false,
    nativeOpenAICompatibleResponsesPassthrough = false
  } = opts;
  const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
  const modelTargetFormat = getModelTargetFormat(alias, resolvedModel);
  const explicitConnectionTargetFormat = providerSpecificData?.targetFormat;
  const inferredAgentRouterTargetFormat = provider === "agentrouter" && !(typeof explicitConnectionTargetFormat === "string" && explicitConnectionTargetFormat) && (sourceFormat === FORMATS.OPENAI_RESPONSES || sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.CLAUDE) ? sourceFormat : void 0;
  const providerTargetFormat = getTargetFormat(provider, providerSpecificData);
  const declaredConnectionAlternate = resolveAlternateFormat(
    getRegistryEntry(provider),
    providerSpecificData
  );
  const customOpenAICompatible = provider.startsWith("openai-compatible-");
  let targetFormat = modelTargetFormat || customModelTargetFormat || declaredConnectionAlternate?.format || (apiFormat === "responses" && !customOpenAICompatible ? FORMATS.OPENAI_RESPONSES : inferredAgentRouterTargetFormat || providerTargetFormat);
  if (nativeXaiResponsesPassthrough || nativeOpenAICompatibleResponsesPassthrough) {
    targetFormat = FORMATS.OPENAI_RESPONSES;
  }
  return { alias, targetFormat };
}
export {
  resolveChatCoreTargetFormat
};
