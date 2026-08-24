export default {
  id: "qoder",
  priority: 30,
  alias: "qd",
  uiAlias: "qd",
  display: {
    name: "Qoder",
    icon: "water_drop",
    color: "#EC4899",
    website: "https://qoder.com",
    notice: {
      signupUrl: "https://qoder.com",
    },
  },
  category: "oauth",
  authModes: ["oauth", "apikey"],
  hasOAuth: true,
  authHint: "Personal Access Token (pt-...) từ https://qoder.com/account/integrations",
  transport: {
    baseUrl: "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation",
    headers: {},
    timeoutMs: 120000,
    stallTimeoutMs: 120000,
    usage: {
      url: "https://openapi.qoder.sh/api/v2/quota/usage",
    },
  },
  models: [
    // Opaque tier keys with no identifiable real model were removed (unclear).
    // Wire tokens are preserved via upstreamModelId (the Qoder API requires them);
    // the canonical ids below are the real models users actually get.
    { id: "qwen3.8-max-preview", name: "Qwen 3.8 Max (Preview)", upstreamModelId: "qmodel_preview" },
    { id: "qwen3.7-max", name: "Qwen 3.7 Max", upstreamModelId: "qmodel_latest" },
    { id: "qwen3.7-plus", name: "Qwen 3.7 Plus", upstreamModelId: "qmodel" },
    { id: "kimi-k3", name: "Kimi K3", upstreamModelId: "kmodel_latest" },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", upstreamModelId: "kmodel" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", upstreamModelId: "dmodel" },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", upstreamModelId: "dfmodel" },
    { id: "minimax-m3", name: "MiniMax M3", upstreamModelId: "mmodel" },
  ],
  oauth: {
    openApiBaseUrl: "https://openapi.qoder.sh",
    centerBaseUrl: "https://center.qoder.sh",
    chatBaseUrl: "https://api3.qoder.sh",
    deviceTokenUrl: "https://openapi.qoder.sh/api/v1/deviceToken/poll",
    refreshUrl: "https://center.qoder.sh/algo/api/v3/user/refresh_token",
    userInfoUrl: "https://openapi.qoder.sh/api/v1/userinfo",
    quotaUsageUrl: "https://openapi.qoder.sh/api/v2/quota/usage",
    loginUrl: "https://qoder.com/device/selectAccounts",
  },
  features: {
    usage: true,
    // PAT (apikey) connections also carry quota usage (via job-token exchange).
    usageApikey: true,
  },
};
