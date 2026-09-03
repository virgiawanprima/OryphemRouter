import { isFingerprintProvider } from "../utils/omni/comboFingerprintExpansion.js";
import { log } from "../utils/log.js";
const CACHE_TAG_PATTERN = /<omniModel>([^<]+)<\/omniModel>/;
const CACHE_TAG_PATTERN_GLOBAL = /(?:\\n|\n|\r){0,16}<omniModel>([^<]+)<\/omniModel>(?:\\n|\n|\r){0,16}/g;
function injectModelTag(messages, providerModel) {
  const cleaned = messages.map((msg2) => {
    if (msg2.role === "assistant" && typeof msg2.content === "string") {
      return { ...msg2, content: msg2.content.replace(CACHE_TAG_PATTERN_GLOBAL, "").trimEnd() };
    }
    return msg2;
  });
  const lastAssistantIdx = cleaned.map((m) => m.role).lastIndexOf("assistant");
  if (lastAssistantIdx === -1) {
    return [...cleaned, { role: "assistant", content: `<omniModel>${providerModel}</omniModel>` }];
  }
  const msg = cleaned[lastAssistantIdx];
  if (typeof msg.content !== "string") {
    return [...cleaned, { role: "assistant", content: `<omniModel>${providerModel}</omniModel>` }];
  }
  const tagged = [...cleaned];
  tagged[lastAssistantIdx] = {
    ...msg,
    content: `${msg.content}<omniModel>${providerModel}</omniModel>`
  };
  return tagged;
}
function extractPinnedModel(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && typeof msg.content === "string") {
      const match = CACHE_TAG_PATTERN.exec(msg.content);
      if (match) return match[1];
    }
  }
  return null;
}
function applySystemMessageOverride(messages, systemMessage) {
  const filtered = messages.filter((m) => m.role !== "system");
  return [{ role: "system", content: systemMessage }, ...filtered];
}
function applyToolFilter(tools, pattern) {
  if (!tools || !pattern) return tools;
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch {
    log.warn("COMBO-AGENT", `[ComboAgent] Invalid tool_filter_regex: "${pattern}"`);
    return tools;
  }
  return tools.filter((tool) => {
    const t = tool;
    const name = t.function?.name ?? t.name ?? "";
    return regex.test(String(name));
  });
}
function stripModelTags(messages) {
  return messages.map((msg) => {
    if (typeof msg.content === "string" && CACHE_TAG_PATTERN.test(msg.content)) {
      return { ...msg, content: msg.content.replace(CACHE_TAG_PATTERN_GLOBAL, "").trimEnd() };
    }
    return msg;
  });
}
function applyComboAgentMiddleware(body, comboConfig, providerModel) {
  if (!comboConfig) return { body, pinnedModel: null };
  const hasMessages = Array.isArray(body.messages);
  const isResponsesRequest = Object.prototype.hasOwnProperty.call(body, "input") || Object.prototype.hasOwnProperty.call(body, "instructions");
  const systemMessage = typeof comboConfig.system_message === "string" && comboConfig.system_message.trim() ? comboConfig.system_message : null;
  let messages = hasMessages ? [...body.messages] : [];
  let pinnedModel = null;
  pinnedModel = null;
  if (systemMessage && !isResponsesRequest) {
    messages = applySystemMessageOverride(messages, systemMessage);
  }
  const filteredTools = applyToolFilter(
    body.tools,
    comboConfig.tool_filter_regex
  );
  messages = stripModelTags(messages);
  return {
    body: {
      ...body,
      ...isResponsesRequest && systemMessage ? { instructions: systemMessage } : {},
      ...hasMessages ? { messages } : {},
      ...filteredTools !== body.tools && { tools: filteredTools }
    },
    pinnedModel
  };
}
function expandStringTemplates(value, values) {
  let out = "";
  let rest = value;
  while (rest.length > 0) {
    const start = rest.indexOf("{{");
    if (start === -1) {
      out += rest;
      break;
    }
    const end = rest.indexOf("}}", start + 2);
    if (end === -1) {
      out += rest;
      break;
    }
    const token = rest.slice(start, end + 2);
    out += rest.slice(0, start);
    out += token in values ? values[token] : token;
    rest = rest.slice(end + 2);
  }
  return out;
}
function expandComboSystemPromptTemplates(body, ctx) {
  const values = {
    "{{MODEL_ID}}": ctx.modelId,
    "{{PROVIDER_ID}}": ctx.providerId,
    "{{ACCOUNT}}": ctx.account,
    "{{FINGERPRINT}}": ctx.fingerprint
  };
  const result = { ...body };
  if (typeof result.instructions === "string") {
    result.instructions = expandStringTemplates(result.instructions, values);
    return result;
  }
  const messages = result.messages;
  if (Array.isArray(messages)) {
    const first = messages[0];
    if (first && (first.role === "system" || first.role === "developer") && typeof first.content === "string") {
      const next = [...messages];
      next[0] = { ...first, content: expandStringTemplates(first.content, values) };
      result.messages = next;
    }
  }
  return result;
}
function expandComboSystemPromptIfPresent(body, combo, ctx) {
  if (typeof combo.system_message === "string" && combo.system_message.trim()) {
    return expandComboSystemPromptTemplates(body, ctx);
  }
  return body;
}
function resolveTargetFingerprint(target) {
  if (!isFingerprintProvider(target.provider)) return null;
  if (target.pinnedFingerprint) return target.pinnedFingerprint;
  const key = target.executionKey;
  if (key) {
    const marker = "@fp:";
    const idx = key.lastIndexOf(marker);
    if (idx !== -1) return key.slice(idx + marker.length);
  }
  return null;
}
export {
  applyComboAgentMiddleware,
  applySystemMessageOverride,
  applyToolFilter,
  expandComboSystemPromptIfPresent,
  expandComboSystemPromptTemplates,
  extractPinnedModel,
  injectModelTag,
  resolveTargetFingerprint,
  stripModelTags
};
