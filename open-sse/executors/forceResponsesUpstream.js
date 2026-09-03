import { resolveOpenAICompatibleApiType as getOpenAICompatibleType } from "../services/provider.js";
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function shouldForceResponsesUpstream(provider, body, credentials) {
  if (!provider.startsWith("openai-compatible-")) return false;
  if (!isRecord(body)) return false;
  const providerSpecificData = credentials?.providerSpecificData ?? null;
  if (providerSpecificData?._omnirouteForceResponsesUpstream === true) return true;
  if (getOpenAICompatibleType(provider, { providerSpecificData }) === "responses") return false;
  if (providerSpecificData && typeof providerSpecificData.apiType === "string" && providerSpecificData.apiType === "chat") {
    return false;
  }
  const hasResponsesShape = body.input !== void 0 || body.previous_response_id !== void 0 || body.max_output_tokens !== void 0 || body.reasoning !== void 0;
  if (!hasResponsesShape) return false;
  const tools = Array.isArray(body.tools) ? body.tools : [];
  return tools.some((toolValue) => {
    if (!isRecord(toolValue)) return false;
    const toolType = typeof toolValue.type === "string" ? toolValue.type : "";
    return toolType === "namespace" || /^tool_search/.test(toolType);
  });
}
function withForcedResponsesUpstream(provider, body, credentials) {
  if (!shouldForceResponsesUpstream(provider, body, credentials)) return credentials;
  return {
    ...credentials,
    providerSpecificData: {
      ...credentials.providerSpecificData,
      _omnirouteForceResponsesUpstream: true
    }
  };
}
export {
  shouldForceResponsesUpstream,
  withForcedResponsesUpstream
};
