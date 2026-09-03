const KIMI_CODING_BASE_URL = "https://api.kimi.com/coding/v1";
const KIMI_CODING_MODELS_URL = `${KIMI_CODING_BASE_URL}/models`;
const KIMI_CODING_OPENAI_URL = `${KIMI_CODING_BASE_URL}/chat/completions`;
const KIMI_CODING_ANTHROPIC_URL = `${KIMI_CODING_BASE_URL}/messages?beta=true`;
const KIMI_CODE_CLI_PLATFORM = "kimi_code_cli";
const KIMI_CODE_CLI_VERSION = "0.26.0";
const KIMI_CODE_STATIC_THINKING_POLICIES = {
  k3: {
    supportsThinking: true,
    supportedThinkingEfforts: ["low", "high", "max"],
    defaultThinkingEffort: "max"
  }
};
function getKimiCodeStaticThinkingPolicy(modelId) {
  if (typeof modelId !== "string") return null;
  const normalizedModel = modelId.trim().toLowerCase().split("/").pop() || "";
  if (/^k3(?:$|-)/.test(normalizedModel)) return KIMI_CODE_STATIC_THINKING_POLICIES.k3;
  return KIMI_CODE_STATIC_THINKING_POLICIES[normalizedModel] || null;
}
function sanitizeKimiHeaderValue(value, fallback = "unknown") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.replace(/[^\x20-\x7e]/g, "").trim() || fallback;
}
function normalizeKimiDeviceId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const deviceId = sanitizeKimiHeaderValue(raw);
  if (!/^[0-9a-f]{32}$/i.test(deviceId)) return deviceId;
  return [
    deviceId.slice(0, 8),
    deviceId.slice(8, 12),
    deviceId.slice(12, 16),
    deviceId.slice(16, 20),
    deviceId.slice(20)
  ].join("-");
}
function getKimiCodeCliVersion() {
  return sanitizeKimiHeaderValue(process.env.KIMI_CLI_VERSION, KIMI_CODE_CLI_VERSION);
}
function getKimiCodeCliUserAgent() {
  return `kimi-code-cli/${getKimiCodeCliVersion()}`;
}
function buildKimiCodeIdentityHeaders(identity, version = getKimiCodeCliVersion()) {
  return {
    "X-Msh-Platform": KIMI_CODE_CLI_PLATFORM,
    "X-Msh-Version": sanitizeKimiHeaderValue(version, KIMI_CODE_CLI_VERSION),
    "X-Msh-Device-Name": sanitizeKimiHeaderValue(identity.deviceName),
    "X-Msh-Device-Model": sanitizeKimiHeaderValue(identity.deviceModel),
    "X-Msh-Os-Version": sanitizeKimiHeaderValue(identity.osVersion),
    "X-Msh-Device-Id": sanitizeKimiHeaderValue(normalizeKimiDeviceId(identity.deviceId))
  };
}
export {
  KIMI_CODE_CLI_PLATFORM,
  KIMI_CODE_CLI_VERSION,
  KIMI_CODING_ANTHROPIC_URL,
  KIMI_CODING_BASE_URL,
  KIMI_CODING_MODELS_URL,
  KIMI_CODING_OPENAI_URL,
  buildKimiCodeIdentityHeaders,
  getKimiCodeCliUserAgent,
  getKimiCodeCliVersion,
  getKimiCodeStaticThinkingPolicy,
  normalizeKimiDeviceId,
  sanitizeKimiHeaderValue
};
