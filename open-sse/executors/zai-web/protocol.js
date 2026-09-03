import { Buffer } from "node:buffer";
import { createHmac, randomUUID } from "node:crypto";
import { extractImageUrls } from "../../utils/cursorImages.js";
import { normalizeCookie, sanitizeErrorMessage } from "../../utils/errorSanitize.js";
const ZAI_BASE_URL = "https://chat.z.ai";
const ZAI_NEW_CHAT_URL = `${ZAI_BASE_URL}/api/v1/chats/new`;
const ZAI_CHAT_URL = `${ZAI_BASE_URL}/api/v2/chat/completions`;
const ZAI_DEFAULT_MODEL = "GLM-5.1";
const ZAI_DEFAULT_FE_VERSION = "prod-fe-1.1.79";
const ZAI_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const ZAI_FE_VERSION_CACHE_TTL_MS = 15 * 60 * 1e3;
const CLIENT_PROTOCOL_VERSION = "0.0.1";
const SIGNATURE_KEY = "key-@@@@)))()((9))-xxxx&&&%%%%%";
const NO_ZAI_MODEL_CAPABILITIES = Object.freeze({
  mcp: false,
  reasoningEffort: false,
  returnFc: false,
  thinking: false,
  vision: false,
  vlmTools: false,
  vlmWebSearch: false,
  vlmWebsiteMode: false,
  webSearch: false
});
const ZAI_MODEL_CAPABILITIES = {
  "glm-5.2": {
    mcp: true,
    reasoningEffort: true,
    returnFc: true,
    thinking: true,
    vision: false,
    vlmTools: false,
    vlmWebSearch: false,
    vlmWebsiteMode: false,
    webSearch: true
  },
  "glm-5.1": {
    mcp: true,
    reasoningEffort: false,
    returnFc: true,
    thinking: true,
    vision: false,
    vlmTools: false,
    vlmWebSearch: false,
    vlmWebsiteMode: false,
    webSearch: true
  },
  "glm-5-turbo": {
    mcp: true,
    reasoningEffort: false,
    returnFc: true,
    thinking: true,
    vision: false,
    vlmTools: false,
    vlmWebSearch: false,
    vlmWebsiteMode: false,
    webSearch: true
  },
  "glm-5v-turbo": {
    mcp: false,
    reasoningEffort: false,
    returnFc: true,
    thinking: true,
    vision: true,
    vlmTools: true,
    vlmWebSearch: true,
    vlmWebsiteMode: true,
    webSearch: true
  }
};
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function browserFailureDetail(body) {
  const raw = body.toString("utf8").trim();
  if (!raw) return "";
  try {
    const parsed = asRecord(JSON.parse(raw));
    const error = asRecord(parsed?.error);
    const detail = error?.message ?? parsed?.detail ?? parsed?.message;
    if (typeof detail === "string") return sanitizeErrorMessage(detail).slice(0, 500);
  } catch {
  }
  return sanitizeErrorMessage(raw).slice(0, 500);
}
function describeZaiBrowserFailure(result) {
  const status = result.status > 0 ? String(result.status) : "no matching response";
  const timing = `capture ${result.timing.captureResponseMs}ms, total ${result.timing.totalMs}ms`;
  const observed = result.observedPostUrls && result.observedPostUrls.length > 0 ? ` Observed POST targets: ${result.observedPostUrls.join(", ")}.` : "";
  const detail = browserFailureDetail(result.body) || (result.status === 0 ? `The page did not issue the expected authenticated chat completion request.${observed}` : "The browser response body was empty.");
  return `Z.ai browser transport failed (${status}; ${timing}): ${detail}`;
}
function parseCredentialJson(raw) {
  if (!raw.trim().startsWith("{")) return null;
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}
function extractZaiToken(rawCredential) {
  const trimmed = rawCredential.trim();
  const json = parseCredentialJson(trimmed);
  if (json) {
    const token = json.token ?? json.accessToken ?? json.access_token;
    return typeof token === "string" ? token.trim() : "";
  }
  const bearer = trimmed.match(/^(?:Authorization:\s*)?Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  const normalized = normalizeCookie(trimmed);
  if (!normalized) return "";
  const match = normalized.match(/(?:^|;\s*)token=([^;]+)/);
  if (match) return match[1].trim();
  return normalized.includes(";") || normalized.includes("=") ? "" : normalized;
}
function extractZaiCaptchaVerifyParam(value) {
  const record = asRecord(value);
  if (record) {
    const direct = record.captcha_verify_param ?? record.captchaVerifyParam ?? record.zaiCaptchaVerifyParam;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const nested = asRecord(record.providerSpecificData);
    if (nested) return extractZaiCaptchaVerifyParam(nested);
    return "";
  }
  if (typeof value !== "string") return "";
  const json = parseCredentialJson(value);
  if (json) return extractZaiCaptchaVerifyParam(json);
  const match = value.match(/(?:^|;\s*)captcha_verify_param=([^;]+)/);
  return match?.[1]?.trim() ?? "";
}
function resolveZaiCaptchaVerifyParam(credentials, body) {
  return extractZaiCaptchaVerifyParam(body) || extractZaiCaptchaVerifyParam(credentials.providerSpecificData) || extractZaiCaptchaVerifyParam(credentials.apiKey) || extractZaiCaptchaVerifyParam(credentials.accessToken);
}
function extractZaiUserId(token) {
  const payload = token.split(".")[1];
  if (!payload) return "";
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded?.id === "string" ? decoded.id : "";
  } catch {
    return "";
  }
}
function buildZaiSignature(input) {
  const timestamp = String(input.timestamp);
  const sortedPayload = Object.entries({
    timestamp,
    requestId: input.requestId,
    user_id: input.userId
  }).sort(([left], [right]) => left.localeCompare(right)).join(",");
  const encodedPrompt = Buffer.from(input.prompt, "utf8").toString("base64");
  const bucket = Math.floor(Number(timestamp) / (5 * 60 * 1e3));
  const derivedKey = createHmac("sha256", SIGNATURE_KEY).update(String(bucket)).digest("hex");
  return createHmac("sha256", derivedKey).update(`${sortedPayload}|${encodedPrompt}|${timestamp}`).digest("hex");
}
function parseZaiFrontendVersion(html) {
  return html.match(/\/frontend\/(prod-fe-\d+(?:\.\d+)*)\/assets\//)?.[1] ?? null;
}
function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => {
    const record = asRecord(part);
    if (!record || record.type !== "text" && record.type !== "input_text") return [];
    const text = record.text ?? record.content;
    return typeof text === "string" ? [text] : [];
  }).join("\n");
}
function latestUserPrompt(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role !== "user") continue;
    return textContent(messages[index].content);
  }
  return "";
}
function foldMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: textContent(message.content)
  }));
}
function browserPrompt(messages) {
  const folded = foldMessages(messages);
  if (folded.length === 1 && folded[0]?.role === "user") return folded[0].content;
  return folded.map((message) => `${message.role.toUpperCase()}:
${message.content}`).join("\n\n");
}
function collectZaiImageUrls(messages) {
  return messages.flatMap(
    (message) => message.role === "user" ? extractImageUrls(message.content) : []
  );
}
function zaiImageFileName(mimeType, index) {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  const extension = normalized === "image/jpeg" ? "jpg" : normalized === "image/svg+xml" ? "svg" : normalized.startsWith("image/") ? normalized.slice("image/".length).replace(/[^a-z0-9]/g, "") || "png" : "png";
  return `omniroute-image-${index + 1}.${extension}`;
}
function unprefixedModelId(modelId) {
  return modelId.trim().split("/").at(-1) || modelId.trim();
}
function browserModelName(modelId) {
  const unprefixed = unprefixedModelId(modelId);
  if (unprefixed.toLowerCase() === "glm-5.2") return "GLM-5.2";
  if (unprefixed.toLowerCase() === "glm-5v-turbo") return "GLM-5V-Turbo";
  return unprefixed;
}
function getZaiModelCapabilities(modelId) {
  return ZAI_MODEL_CAPABILITIES[unprefixedModelId(modelId).toLowerCase()] ?? NO_ZAI_MODEL_CAPABILITIES;
}
function getFeatureOption(body, key) {
  if (body[key] !== void 0) return body[key];
  return asRecord(body.features)?.[key];
}
function resolveZaiThinkingConfig(modelId, body) {
  const capabilities = getZaiModelCapabilities(modelId);
  const supported = capabilities.thinking;
  const reasoning = asRecord(body.reasoning);
  const rawEffort = typeof body.reasoning_effort === "string" ? body.reasoning_effort.trim().toLowerCase() : typeof reasoning?.effort === "string" ? reasoning.effort.trim().toLowerCase() : "";
  const disabled = body.enable_thinking === false || rawEffort === "none" || rawEffort === "off";
  const effort = rawEffort === "low" || rawEffort === "medium" || rawEffort === "high" ? "high" : "max";
  return {
    supported,
    enabled: supported && !disabled,
    effort,
    effortSupported: capabilities.reasoningEffort
  };
}
function resolveZaiVlmConfig(modelId, body) {
  const capabilities = getZaiModelCapabilities(modelId);
  const toolsOption = getFeatureOption(body, "vlm_tools_enable");
  const webSearchOption = getFeatureOption(body, "vlm_web_search_enable") ?? getFeatureOption(body, "auto_web_search") ?? getFeatureOption(body, "web_search");
  const webSearchEnabled = webSearchOption === true || webSearchOption !== false && capabilities.vlmWebSearch;
  return {
    toolsEnabled: capabilities.vlmTools && toolsOption !== false,
    webSearchEnabled: capabilities.webSearch && webSearchEnabled,
    websiteModeEnabled: capabilities.vlmWebsiteMode
  };
}
function buildZaiHeaders(token, options) {
  const headers = {
    "Content-Type": "application/json",
    Accept: options.accept,
    "Accept-Language": "en-US",
    "User-Agent": ZAI_USER_AGENT,
    Origin: ZAI_BASE_URL,
    Referer: `${ZAI_BASE_URL}/`,
    Authorization: `Bearer ${token}`
  };
  if (options.frontendVersion) headers["X-FE-Version"] = options.frontendVersion;
  if (options.signature) headers["X-Signature"] = options.signature;
  return headers;
}
function buildZaiCompletionUrl(input) {
  const now = new Date(input.timestamp);
  const params = new URLSearchParams({
    timestamp: String(input.timestamp),
    requestId: input.requestId,
    user_id: input.userId,
    version: CLIENT_PROTOCOL_VERSION,
    platform: "web",
    token: input.token,
    user_agent: ZAI_USER_AGENT,
    language: "en-US",
    languages: "en-US,en",
    timezone: "UTC",
    cookie_enabled: "true",
    screen_width: "1280",
    screen_height: "800",
    screen_resolution: "1280x800",
    viewport_height: "800",
    viewport_width: "1280",
    viewport_size: "1280x800",
    color_depth: "24",
    pixel_ratio: "1",
    current_url: `${ZAI_BASE_URL}/`,
    pathname: "/",
    search: "",
    hash: "",
    host: "chat.z.ai",
    hostname: "chat.z.ai",
    protocol: "https:",
    referrer: "",
    title: "Z.ai - Advanced AI Chatbot & Agent powered by GLM-5.2",
    timezone_offset: "0",
    local_time: now.toISOString(),
    utc_time: now.toUTCString(),
    is_mobile: "false",
    is_touch: "false",
    max_touch_points: "0",
    browser_name: "Chrome",
    os_name: "Mac OS",
    signature_timestamp: String(input.timestamp)
  });
  return `${ZAI_CHAT_URL}?${params.toString()}`;
}
function buildZaiNewChatBody(messages, modelId, enableThinking, reasoningEffort, vlmConfig) {
  const prompt = latestUserPrompt(messages);
  const userMessageId = randomUUID();
  return {
    userMessageId,
    payload: {
      chat: {
        id: "",
        title: "New Chat",
        models: [modelId],
        params: {},
        history: {
          messages: {
            [userMessageId]: {
              id: userMessageId,
              parentId: null,
              childrenIds: [],
              role: "user",
              content: prompt,
              timestamp: Math.floor(Date.now() / 1e3),
              models: [modelId]
            }
          },
          currentId: userMessageId
        },
        tags: [],
        flags: [],
        features: [
          {
            server: "tool_selector_h",
            status: "hidden",
            type: "tool_selector"
          }
        ],
        mcp_servers: [],
        enable_thinking: enableThinking,
        reasoning_effort: reasoningEffort,
        auto_web_search: vlmConfig.webSearchEnabled,
        message_version: 1,
        extra: {
          vlm_tools_enable: vlmConfig.toolsEnabled,
          vlm_web_search_enable: vlmConfig.websiteModeEnabled && vlmConfig.webSearchEnabled,
          vlm_website_mode: vlmConfig.websiteModeEnabled
        },
        timestamp: Date.now(),
        type: "default"
      }
    }
  };
}
function buildZaiRequestBody(input) {
  const params = Object.fromEntries(
    ["temperature", "top_p", "max_tokens", "stop"].filter((key) => input.body[key] !== void 0).map((key) => [key, input.body[key]])
  );
  const features = {
    image_generation: false,
    web_search: false,
    auto_web_search: input.vlmConfig.websiteModeEnabled ? false : input.vlmConfig.webSearchEnabled,
    preview_mode: true,
    flags: [],
    vlm_tools_enable: input.vlmConfig.toolsEnabled,
    vlm_web_search_enable: input.vlmConfig.websiteModeEnabled && input.vlmConfig.webSearchEnabled,
    vlm_website_mode: input.vlmConfig.websiteModeEnabled,
    enable_thinking: input.enableThinking
  };
  if (input.enableThinking && input.reasoningEffortSupported) {
    features.reasoning_effort = input.reasoningEffort;
  }
  return {
    stream: true,
    model: input.modelId,
    messages: foldMessages(input.messages),
    signature_prompt: input.prompt,
    params,
    extra: {
      vlm_tools_enable: input.vlmConfig.toolsEnabled,
      vlm_web_search_enable: input.vlmConfig.websiteModeEnabled && input.vlmConfig.webSearchEnabled,
      vlm_website_mode: input.vlmConfig.websiteModeEnabled
    },
    features,
    variables: {},
    chat_id: input.chatId,
    id: randomUUID(),
    current_user_message_id: input.userMessageId,
    current_user_message_parent_id: null,
    background_tasks: {
      title_generation: true,
      tags_generation: true
    },
    captcha_verify_param: input.captchaVerifyParam
  };
}
export {
  ZAI_BASE_URL,
  ZAI_CHAT_URL,
  ZAI_DEFAULT_FE_VERSION,
  ZAI_DEFAULT_MODEL,
  ZAI_FE_VERSION_CACHE_TTL_MS,
  ZAI_NEW_CHAT_URL,
  ZAI_USER_AGENT,
  asRecord,
  browserModelName,
  browserPrompt,
  buildZaiCompletionUrl,
  buildZaiHeaders,
  buildZaiNewChatBody,
  buildZaiRequestBody,
  buildZaiSignature,
  collectZaiImageUrls,
  describeZaiBrowserFailure,
  extractZaiCaptchaVerifyParam,
  extractZaiToken,
  extractZaiUserId,
  foldMessages,
  getZaiModelCapabilities,
  latestUserPrompt,
  parseZaiFrontendVersion,
  resolveZaiCaptchaVerifyParam,
  resolveZaiThinkingConfig,
  resolveZaiVlmConfig,
  unprefixedModelId,
  zaiImageFileName
};
