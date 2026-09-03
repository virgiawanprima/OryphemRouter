import { getKimiCodeStaticThinkingPolicy } from "../../utils/omni/kimiCodingRuntime.js";
import { FORMATS } from "../../translator/formats.js";
function buildKimiThinkingMetadata(modelInfo, staticThinkingPolicy) {
  const { supportsThinking, supportedThinkingEfforts, defaultThinkingEffort } = resolveKimiThinkingPolicyValues(modelInfo, staticThinkingPolicy);
  const metadata = {};
  if (typeof supportsThinking === "boolean") metadata.supportsThinking = supportsThinking;
  if (modelInfo?.alwaysThinking === true || staticThinkingPolicy?.alwaysThinking === true) {
    metadata.alwaysThinking = true;
  }
  if (supportedThinkingEfforts) metadata.supportedThinkingEfforts = supportedThinkingEfforts;
  if (defaultThinkingEffort) metadata.defaultThinkingEffort = defaultThinkingEffort;
  return metadata;
}
function resolveKimiThinkingPolicyValues(modelInfo, staticThinkingPolicy) {
  const supportsThinking = typeof modelInfo?.supportsThinking === "boolean" ? modelInfo.supportsThinking : staticThinkingPolicy?.supportsThinking;
  const supportedThinkingEfforts = Array.isArray(modelInfo?.supportedThinkingEfforts) ? modelInfo.supportedThinkingEfforts : staticThinkingPolicy?.supportedThinkingEfforts;
  const defaultThinkingEffort = typeof modelInfo?.defaultThinkingEffort === "string" ? modelInfo.defaultThinkingEffort : staticThinkingPolicy?.defaultThinkingEffort;
  return { supportsThinking, supportedThinkingEfforts, defaultThinkingEffort };
}
function applyKimiExecutionMetadata(providerSpecificData, provider, targetFormat, modelInfo) {
  if (provider !== "kimi-coding" && provider !== "kimi-coding-apikey") return;
  const staticThinkingPolicy = getKimiCodeStaticThinkingPolicy(modelInfo?.model);
  providerSpecificData._omnirouteKimiTargetFormat = targetFormat;
  providerSpecificData._omnirouteKimiThinking = buildKimiThinkingMetadata(
    modelInfo,
    staticThinkingPolicy
  );
}
function resolveExecutionCredentials(opts) {
  const {
    credentials,
    nativeCodexPassthrough,
    endpointPath,
    targetFormat,
    provider,
    ccSessionId,
    modelInfo
  } = opts;
  const nextCredentials = nativeCodexPassthrough ? { ...credentials, requestEndpointPath: endpointPath } : credentials;
  const providerSpecificData = nextCredentials?.providerSpecificData && typeof nextCredentials.providerSpecificData === "object" ? { ...nextCredentials.providerSpecificData } : {};
  if (targetFormat === FORMATS.OPENAI_RESPONSES && (provider === "azure-ai" || provider === "oci") && providerSpecificData.apiType !== "responses") {
    providerSpecificData.apiType = "responses";
  }
  if (targetFormat === FORMATS.OPENAI_RESPONSES && (provider === "azure-ai" || provider === "oci")) {
    providerSpecificData._omnirouteForceResponsesUpstream = true;
  }
  if (targetFormat === FORMATS.OPENAI_RESPONSES && provider === "poe") {
    providerSpecificData._omnirouteForceResponsesUpstream = true;
  }
  if (targetFormat === FORMATS.CLAUDE && provider === "poe") {
    providerSpecificData.disableStreamOptions = true;
  }
  if (targetFormat === FORMATS.OPENAI && (provider === "zai" || provider === "glm-coding-apikey")) {
    providerSpecificData.targetFormat = targetFormat;
  }
  if (provider === "agentrouter" && (targetFormat === FORMATS.OPENAI || targetFormat === FORMATS.OPENAI_RESPONSES)) {
    providerSpecificData.targetFormat = targetFormat;
  }
  if (targetFormat === FORMATS.OPENAI_RESPONSES && provider === "github") {
    providerSpecificData.targetFormat = targetFormat;
  }
  applyKimiExecutionMetadata(providerSpecificData, provider, targetFormat, modelInfo);
  const withApiType = {
    ...nextCredentials,
    providerSpecificData
  };
  if (!ccSessionId) return withApiType;
  return {
    ...withApiType,
    providerSpecificData: {
      ...withApiType?.providerSpecificData || {},
      ccSessionId
    }
  };
}
function getExecutionConnectionId(credentials) {
  if (!credentials || typeof credentials !== "object") return null;
  const connectionId = credentials.connectionId;
  return typeof connectionId === "string" && connectionId.trim() ? connectionId.trim() : null;
}
export {
  getExecutionConnectionId,
  resolveExecutionCredentials
};
