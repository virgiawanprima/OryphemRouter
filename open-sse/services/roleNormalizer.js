const PROVIDERS_WITHOUT_SYSTEM_ROLE = /* @__PURE__ */ new Set([
  // Known to reject system role (from troubleshooting report)
  // GLM uses Claude format, so this is handled through claude translator
  // But if accessed through OpenAI-format providers like nvidia, it needs this:
  // DuckDuckGo duck.ai (duckchat/v1/chat) accepts only user/assistant roles — a
  // system/developer message yields 400 ERR_BAD_REQUEST (#ddgw). Registry id +
  // alias are both listed because either may arrive as the routing provider id.
  "duckduckgo-web",
  "ddgw"
]);
const PROVIDERS_PRESERVING_DEVELOPER_ROLE = /* @__PURE__ */ new Set(["openai", "azure-openai", "azure", "github"]);
function defaultPreserveDeveloperForProvider(provider) {
  const id = provider.trim().toLowerCase();
  if (!id) return false;
  if (PROVIDERS_PRESERVING_DEVELOPER_ROLE.has(id)) return true;
  if (id.includes("openai")) return true;
  return false;
}
const MODELS_WITHOUT_SYSTEM_ROLE = [
  "ernie-"
  // Baidu ERNIE models
];
function isGlmWithoutSystemRole(modelLower) {
  if (!modelLower.startsWith("glm")) return false;
  const match = modelLower.match(/glm-?(\d+)(?:[.p](\d+))?/);
  if (match) {
    const major = Number(match[1]);
    const minor = match[2] ? Number(match[2]) : 0;
    if (major > 5 || major === 5 && minor >= 1) return false;
  }
  return true;
}
const PROVIDER_SCOPED_MODELS_WITHOUT_SYSTEM_ROLE = {
  // ZenMux exposes Z.AI GLM through OpenAI-compatible model ids such as
  // "z-ai/glm-5.2". Z.AI rejects compressed histories that start with a
  // system summary followed by an assistant/tool bundle, while OpenRouter
  // tolerates the same shape. Treat these vendor-prefixed GLM ids like native
  // GLM so normalizeSystemRole moves system/developer content into a user turn.
  zenmux: [/(?:^|\/)glm(?:-|$)/i]
};
function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(
    (part) => !!part && typeof part === "object" && "type" in part && part.type === "text"
  ).map((part) => typeof part.text === "string" ? part.text : "").join("\n");
}
function supportsSystemRole(provider, model) {
  const providerLower = (provider || "").trim().toLowerCase();
  if (PROVIDERS_WITHOUT_SYSTEM_ROLE.has(providerLower)) return false;
  const modelLower = (model || "").toLowerCase();
  for (const pattern of PROVIDER_SCOPED_MODELS_WITHOUT_SYSTEM_ROLE[providerLower] ?? []) {
    if (pattern.test(modelLower)) return false;
  }
  if (isGlmWithoutSystemRole(modelLower)) return false;
  for (const prefix of MODELS_WITHOUT_SYSTEM_ROLE) {
    if (modelLower.startsWith(prefix)) return false;
  }
  return true;
}
function normalizeDeveloperRole(messages, targetFormat, preserveDeveloperRole, provider) {
  if (!Array.isArray(messages)) return messages;
  if (targetFormat === "openai") {
    const effectivePreserve = preserveDeveloperRole !== void 0 ? preserveDeveloperRole : defaultPreserveDeveloperForProvider(provider ?? "");
    if (effectivePreserve) return messages;
  }
  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const role = typeof msg.role === "string" ? msg.role : "";
    if (role.toLowerCase() === "developer") {
      return { ...msg, role: "system" };
    }
    return msg;
  });
}
function normalizeModelRole(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const role = typeof msg.role === "string" ? msg.role : "";
    if (role.toLowerCase() === "model") {
      return { ...msg, role: "assistant" };
    }
    return msg;
  });
}
function normalizeSystemRole(messages, provider, model) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  if (supportsSystemRole(provider, model)) return messages;
  const systemMessages = messages.filter(
    (message) => message.role === "system" || message.role === "developer"
  );
  if (systemMessages.length === 0) return messages;
  const systemContent = systemMessages.map((message) => extractTextFromContent(message.content)).filter(Boolean).join("\n\n");
  if (!systemContent) {
    return messages.filter(
      (message) => message.role !== "system" && message.role !== "developer"
    );
  }
  const nonSystemMessages = messages.filter(
    (message) => message.role !== "system" && message.role !== "developer"
  );
  const firstUserIdx = nonSystemMessages.findIndex(
    (message) => message.role === "user"
  );
  if (firstUserIdx >= 0) {
    const userMsg = nonSystemMessages[firstUserIdx];
    const userContent = extractTextFromContent(userMsg.content);
    nonSystemMessages[firstUserIdx] = {
      ...userMsg,
      content: `[System Instructions]
${systemContent}

[User Message]
${userContent}`
    };
  } else {
    nonSystemMessages.unshift({
      role: "user",
      content: `[System Instructions]
${systemContent}`
    });
  }
  return nonSystemMessages;
}
function normalizeRoles(messages, provider, model, targetFormat, preserveDeveloperRole) {
  if (!Array.isArray(messages)) return messages;
  let result = normalizeModelRole(messages);
  result = normalizeDeveloperRole(result, targetFormat, preserveDeveloperRole, provider);
  result = normalizeSystemRole(result, provider, model);
  return result;
}
export {
  normalizeDeveloperRole,
  normalizeModelRole,
  normalizeRoles,
  normalizeSystemRole
};
