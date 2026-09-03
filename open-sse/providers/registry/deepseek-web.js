export default {
  id: "deepseek-web",
  alias: "ds-web",
  display: {
    name: "DeepSeek Web",
    icon: "chat",
    color: "#4D6BFE",
    textIcon: "DSW",
    website: "https://chat.deepseek.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "deepseek-web",
    baseUrl: "https://chat.deepseek.com/api/v0/chat/completion",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      toolCalling: true,
    },
    {
      id: "deepseek-v4-pro-think",
      name: "DeepSeek V4 Pro Think",
      toolCalling: true,
      supportsReasoning: true,
    },
    {
      id: "deepseek-v4-pro-search",
      name: "DeepSeek V4 Pro Search",
      toolCalling: true,
    },
    {
      id: "deepseek-v4-pro-think-search",
      name: "DeepSeek V4 Pro Think+Search",
      toolCalling: true,
      supportsReasoning: true,
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      toolCalling: true,
    },
    {
      id: "deepseek-v4-flash-think",
      name: "DeepSeek V4 Flash Think",
      toolCalling: true,
      supportsReasoning: true,
    },
    {
      id: "deepseek-v4-flash-search",
      name: "DeepSeek V4 Flash Search",
      toolCalling: true,
    },
    {
      id: "deepseek-v4-flash-think-search",
      name: "DeepSeek V4 Flash Think+Search",
      toolCalling: true,
      supportsReasoning: true,
    },
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      toolCalling: true,
    },
    {
      id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      toolCalling: true,
      supportsReasoning: true,
    },
    {
      id: "DeepSeek-R1",
      name: "DeepSeek R1",
      toolCalling: true,
      supportsReasoning: true,
    },
    {
      id: "DeepSeek-R1-Search",
      name: "DeepSeek R1 Search",
      toolCalling: true,
      supportsReasoning: true,
    },
    {
      id: "DeepSeek-V3.2",
      name: "DeepSeek V3.2",
      toolCalling: true,
    },
    {
      id: "DeepSeek-Search",
      name: "DeepSeek Search",
      toolCalling: true,
    },
  ],
};
