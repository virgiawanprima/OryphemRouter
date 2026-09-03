export default {
  id: "kimi-coding-apikey",
  alias: "kmca",
  display: {
    name: "Kimi Coding API",
    icon: "code",
    color: "#059669",
    textIcon: "KCA",
    website: "https://platform.moonshot.ai",
  },
  category: "apikey",
  authType: "apikey",
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
