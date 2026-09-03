export default {
  id: "xai-oauth",
  alias: "xao",
  display: {
    name: "xAI (OAuth)",
    icon: "bolt",
    color: "#111827",
    textIcon: "XA",
    website: "https://x.ai",
  },
  category: "oauth",
  authType: "oauth",
  hasOAuth: true,
  transport: {
    format: "openai",
    executor: "xai-oauth",
    baseUrl: "https://api.x.ai/v1/chat/completions",
    validateUrl: "https://api.x.ai/v1/models",
    responsesUrl: "https://api.x.ai/v1/responses",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  oauth: {
    clientIdEnv: "GROK_OAUTH_CLIENT_ID",
    clientId: "b1a00492-073a-47ea-816f-4c329264a828",
    tokenUrl: "https://auth.x.ai/oauth2/token",
  },
  models: [
    {
      id: "grok-4.5",
      name: "Grok 4.5",
      contextLength: 500000,
      targetFormat: "openai-responses",
    },
    {
      id: "grok-4.6",
      name: "Grok 4.6",
      contextLength: 500000,
      supportsReasoning: true,
      supportedThinkingEfforts: [
        "low",
        "medium",
        "high",
        "xhigh",
      ],
      supportsVision: true,
      supportsXHighEffort: true,
      toolCalling: true,
      targetFormat: "openai-responses",
    },
    {
      id: "grok-4.3",
      name: "Grok 4.3",
    },
    {
      id: "grok-build-0.1",
      name: "Grok Build 0.1",
      contextLength: 256000,
    },
    {
      id: "grok-4.20-multi-agent-0309",
      name: "Grok 4.20 Multi Agent",
      targetFormat: "openai-responses",
    },
    {
      id: "grok-4.20-0309-reasoning",
      name: "Grok 4.20 Reasoning",
    },
    {
      id: "grok-4.20-0309-non-reasoning",
      name: "Grok 4.20",
    },
  ],
  passthroughModels: true,
};
