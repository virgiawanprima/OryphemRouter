export default {
  id: "kimi-coding",
  alias: "kmc",
  display: {
    name: "Kimi Coding",
    icon: "code",
    color: "#10B981",
    textIcon: "KC",
    website: "https://www.moonshot.cn",
  },
  category: "oauth",
  authType: "oauth",
  hasOAuth: true,
  transport: {
    format: "claude",
    executor: "default",
    baseUrl: "https://api.kimi.com/coding/v1/messages?beta=true",
    headers: {
      "Anthropic-Version": "2023-06-01",
    },
    auth: {
      combined: true,
      header: "x-api-key",
      scheme: "raw",
    },
  },
  oauth: {
    clientIdEnv: "KIMI_CODING_OAUTH_CLIENT_ID",
    refreshUrl: "https://auth.kimi.com/api/oauth/token",
    clientId: "17e5f671-d194-4dfb-9706-5516cb48c098",
    tokenUrl: "https://auth.kimi.com/api/oauth/token",
    authorizeUrl: "https://auth.kimi.com/api/oauth/device_authorization",
  },
  models: [
    {
      id: "k3",
      name: "Kimi K3",
      contextLength: 1048576,
      supportsReasoning: true,
    },
    {
      id: "kimi-for-coding",
      name: "Kimi K2.7 Code",
      contextLength: 262144,
      supportsReasoning: true,
    },
    {
      id: "kimi-for-coding-highspeed",
      name: "Kimi K2.7 Code (High Speed)",
      contextLength: 262144,
      supportsReasoning: true,
    },
  ],
};
