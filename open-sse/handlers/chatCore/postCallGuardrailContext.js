import {
  resolveDisabledGuardrails as defaultResolveDisabled
} from "../../utils/omni/guardrails.js";
function optionalRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function optionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function buildPostCallGuardrailContext(args, resolveDisabledGuardrails = defaultResolveDisabled) {
  const headers = args.clientRawRequest?.headers ?? null;
  const apiKeyInfo = optionalRecord(args.apiKeyInfo);
  return {
    apiKeyInfo,
    disabledGuardrails: resolveDisabledGuardrails({
      apiKeyInfo,
      body: args.body,
      headers
    }),
    endpoint: optionalString(args.clientRawRequest?.endpoint),
    headers,
    log: args.log,
    method: "POST",
    model: args.model,
    provider: args.provider,
    sourceFormat: optionalString(args.responsePayloadFormat),
    stream: false,
    targetFormat: optionalString(args.clientResponseFormat)
  };
}
export {
  buildPostCallGuardrailContext
};
