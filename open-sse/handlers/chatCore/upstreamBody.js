import {
  applyConfiguredPayloadRules,
  resolvePayloadRuleProtocols
} from "../../utils/omni/payloadRules.js";
import { getEffectiveToolLimit, getKnownToolLimit } from "../../utils/omni/toolLimitDetector.js";
import {
  providerSupportsCaching,
  resolveConnectionCacheOverride
} from "../../utils/cacheControlPolicy.js";
import { FORMATS } from "../../translator/formats.js";
import { sanitizeRequestForResolvedTarget } from "../../utils/omni/targetRequestSanitizer.js";
function buildAppliedRulesSummary(applied) {
  return applied.map((rule) => {
    if (rule.type === "filter") return `${rule.type}:${rule.path}`;
    const serializedValue = JSON.stringify(rule.value);
    const safeValue = typeof serializedValue === "string" && serializedValue.length > 80 ? `${serializedValue.slice(0, 77)}...` : serializedValue;
    return `${rule.type}:${rule.path}=${safeValue}`;
  }).join(", ");
}
function truncateToolList(bodyToSend, provider, bypassDefaultToolLimit, log) {
  if (!Array.isArray(bodyToSend.tools)) return bodyToSend;
  const knownLimit = getKnownToolLimit(provider);
  if (knownLimit !== null) {
    if (bodyToSend.tools.length > knownLimit) {
      const originalCount = bodyToSend.tools.length;
      const truncatedTools = bodyToSend.tools.slice(0, knownLimit);
      bodyToSend = { ...bodyToSend, tools: truncatedTools };
      log?.debug?.(
        "TOOL_LIMIT",
        `Truncated ${originalCount} tools to ${knownLimit} for ${provider}`
      );
    }
    return bodyToSend;
  }
  if (bypassDefaultToolLimit === true) return bodyToSend;
  const effectiveToolLimit = getEffectiveToolLimit(provider);
  if (bodyToSend.tools.length > effectiveToolLimit) {
    const originalCount = bodyToSend.tools.length;
    const truncatedTools = bodyToSend.tools.slice(0, effectiveToolLimit);
    bodyToSend = { ...bodyToSend, tools: truncatedTools };
    log?.debug?.(
      "TOOL_LIMIT",
      `Truncated ${originalCount} tools to ${effectiveToolLimit} for ${provider}`
    );
  }
  return bodyToSend;
}
function defaultImageDetail(bodyToSend, isOpencodeClient) {
  if (!isOpencodeClient) return bodyToSend;
  let nextBody = bodyToSend;
  if (Array.isArray(bodyToSend.messages)) {
    const messages = bodyToSend.messages.map((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return message;
      const messageRecord = message;
      if (!Array.isArray(messageRecord.content)) return message;
      let changed = false;
      const content = messageRecord.content.map((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) return part;
        const partRecord = part;
        const imageUrl = partRecord.image_url;
        if (partRecord.type !== "image_url" || !imageUrl || typeof imageUrl !== "object" || Array.isArray(imageUrl)) {
          return part;
        }
        const imageUrlRecord = imageUrl;
        if (imageUrlRecord.detail !== void 0) return part;
        changed = true;
        return { ...partRecord, image_url: { ...imageUrlRecord, detail: "high" } };
      });
      return changed ? { ...messageRecord, content } : message;
    });
    if (messages.some((message, index) => message !== bodyToSend.messages?.[index])) {
      nextBody = { ...nextBody, messages };
    }
  }
  if (Array.isArray(bodyToSend.input)) {
    const input = bodyToSend.input.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const itemRecord = item;
      if (!Array.isArray(itemRecord.content)) return item;
      let changed = false;
      const content = itemRecord.content.map((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) return part;
        const partRecord = part;
        if (partRecord.type !== "input_image" || partRecord.detail !== void 0) return part;
        changed = true;
        return { ...partRecord, detail: "high" };
      });
      return changed ? { ...itemRecord, content } : item;
    });
    if (input.some((item, index) => item !== bodyToSend.input?.[index])) {
      nextBody = { ...nextBody, input };
    }
  }
  return nextBody;
}
async function injectPromptCacheKey(bodyToSend, provider, targetFormat, connectionCacheOverride) {
  if (targetFormat === FORMATS.OPENAI && providerSupportsCaching(provider, void 0, connectionCacheOverride) && !bodyToSend.prompt_cache_key && Array.isArray(bodyToSend.messages) && !["nvidia", "xai"].includes(provider)) {
    const { generatePromptCacheKey } = await import("../../utils/omni/promptCache.js");
    const cacheKey = generatePromptCacheKey(bodyToSend.messages);
    if (cacheKey) {
      bodyToSend = { ...bodyToSend, prompt_cache_key: cacheKey };
    }
  }
  return bodyToSend;
}
async function prepareUpstreamBody(opts) {
  const {
    translatedBody,
    modelToCall,
    provider,
    targetFormat,
    credentials,
    bypassDefaultToolLimit = false,
    isOpencodeClient = false,
    log
  } = opts;
  let bodyToSend = translatedBody.model === modelToCall ? translatedBody : { ...translatedBody, model: modelToCall };
  const payloadRuleModel = typeof bodyToSend.model === "string" && bodyToSend.model.length > 0 ? bodyToSend.model : modelToCall;
  const payloadRuleProtocols = resolvePayloadRuleProtocols({ provider, targetFormat });
  const payloadRuleResult = await applyConfiguredPayloadRules(
    bodyToSend,
    payloadRuleModel,
    payloadRuleProtocols
  );
  bodyToSend = payloadRuleResult.payload;
  if (payloadRuleResult.applied.length > 0) {
    log?.debug?.(
      "PAYLOAD_RULES",
      `Applied ${payloadRuleResult.applied.length} rule(s) for ${payloadRuleModel} (${payloadRuleProtocols.join(", ")}): ${buildAppliedRulesSummary(payloadRuleResult.applied)}`
    );
  }
  bodyToSend = sanitizeRequestForResolvedTarget(bodyToSend, {
    provider,
    model: payloadRuleModel,
    log
  });
  bodyToSend = defaultImageDetail(bodyToSend, isOpencodeClient);
  bodyToSend = truncateToolList(bodyToSend, provider, bypassDefaultToolLimit ?? false, log);
  const connectionCacheOverride = resolveConnectionCacheOverride(credentials?.providerSpecificData);
  bodyToSend = await injectPromptCacheKey(
    bodyToSend,
    provider,
    targetFormat,
    connectionCacheOverride
  );
  return bodyToSend;
}
export {
  prepareUpstreamBody
};
