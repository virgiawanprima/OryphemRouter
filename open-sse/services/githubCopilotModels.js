import { getGitHubCopilotChatHeaders } from "../utils/omni/providerHeaderProfiles.js";
const GITHUB_COPILOT_MODELS_URL = "https://api.githubcopilot.com/models";
const GITHUB_COPILOT_STATIC_FALLBACK_MODELS = [
  "claude-fable-5",
  "claude-opus-5",
  "claude-opus-4.8-fast",
  "claude-opus-4.8",
  "claude-opus-4.7",
  "claude-opus-4.6",
  "claude-sonnet-4.6",
  "claude-opus-4.5",
  "claude-sonnet-5",
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "gemini-3.1-pro-preview",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.3-codex",
  "gpt-5-mini",
  "gpt-4o-2024-11-20",
  "gpt-4o-mini",
  "gpt-4-0125-preview",
  "kimi-k2.7-code",
  "mai-code-1-flash",
  "mai-code-1.1-flash",
  "mai-code-1-flash-picker",
  "grok-4.6",
  "grok-4.5",
  "oswe-vscode-prime"
];
const GITHUB_COPILOT_MODEL_ALLOWLIST = GITHUB_COPILOT_STATIC_FALLBACK_MODELS;
const GITHUB_COPILOT_STATIC_FALLBACK_SET = new Set(GITHUB_COPILOT_STATIC_FALLBACK_MODELS);
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function isRoutableChatModel(item) {
  const capabilities = asRecord(item.capabilities);
  const capType = toNonEmptyString(capabilities.type);
  if (capType) return capType === "chat";
  const endpoints = Array.isArray(item.supported_endpoints) ? item.supported_endpoints : Array.isArray(asRecord(item.capabilities).supported_endpoints) ? asRecord(item.capabilities).supported_endpoints : [];
  if (endpoints.length > 0) {
    return endpoints.some((e) => {
      const s = toNonEmptyString(e) || "";
      return s.includes("/chat/completions") || s.includes("/responses") || s.includes("/v1/messages");
    });
  }
  const id = (toNonEmptyString(item.id) || toNonEmptyString(item.model) || "").toLowerCase();
  if (!id) return false;
  return !(id.includes("embedding") || id === "gpt-41-copilot");
}
function parseGitHubCopilotModels(data) {
  const payload = asRecord(data);
  const items = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  const seen = /* @__PURE__ */ new Set();
  const models = [];
  for (const value of items) {
    const item = asRecord(value);
    const id = toNonEmptyString(item.id) || toNonEmptyString(item.model);
    if (!id || seen.has(id)) continue;
    if (!isRoutableChatModel(item)) continue;
    seen.add(id);
    const name = toNonEmptyString(item.name) || toNonEmptyString(item.display_name) || id;
    models.push({ id, name, owned_by: "github" });
  }
  return models;
}
function toFallbackResult(fallbackModels) {
  const models = (fallbackModels || []).map((model) => {
    const id = toNonEmptyString(model.id);
    if (!id) return null;
    if (!GITHUB_COPILOT_STATIC_FALLBACK_SET.has(id)) return null;
    return { id, name: toNonEmptyString(model.name) || id, owned_by: "github" };
  }).filter((model) => Boolean(model));
  return { models, source: "fallback" };
}
async function fetchGitHubCopilotModels(options) {
  const { token, fetchImpl = fetch, fallbackModels } = options;
  if (!toNonEmptyString(token)) {
    return toFallbackResult(fallbackModels);
  }
  try {
    const response = await fetchImpl(GITHUB_COPILOT_MODELS_URL, {
      method: "GET",
      headers: {
        ...getGitHubCopilotChatHeaders("application/json"),
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      return toFallbackResult(fallbackModels);
    }
    const data = await response.json();
    const models = parseGitHubCopilotModels(data);
    if (models.length === 0) {
      return toFallbackResult(fallbackModels);
    }
    return { models, source: "api" };
  } catch {
    return toFallbackResult(fallbackModels);
  }
}
function asGheRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function parseGheCopilotModels(data) {
  const payload = asGheRecord(data);
  const items = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  const seen = /* @__PURE__ */ new Set();
  const models = [];
  for (const value of items) {
    const item = asGheRecord(value);
    const id = toNonEmptyString(item.id) || toNonEmptyString(item.name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = toNonEmptyString(item.name) || toNonEmptyString(item.display_name) || toNonEmptyString(item.label) || id;
    models.push({
      id,
      name,
      owned_by: toNonEmptyString(item.vendor || item.provider) || "ghe-copilot"
    });
  }
  return models;
}
async function fetchGheCopilotModels(options) {
  const { apiUrl, token, fetchImpl = fetch } = options;
  const base = toNonEmptyString(apiUrl);
  if (!base || !toNonEmptyString(token)) return [];
  try {
    const response = await fetchImpl(`${base.replace(/\/+$/, "")}/models`, {
      method: "GET",
      headers: {
        ...getGitHubCopilotChatHeaders("application/json"),
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return parseGheCopilotModels(data);
  } catch {
    return [];
  }
}
export {
  GITHUB_COPILOT_MODELS_URL,
  GITHUB_COPILOT_MODEL_ALLOWLIST,
  GITHUB_COPILOT_STATIC_FALLBACK_MODELS,
  fetchGheCopilotModels,
  fetchGitHubCopilotModels,
  parseGheCopilotModels,
  parseGitHubCopilotModels
};
