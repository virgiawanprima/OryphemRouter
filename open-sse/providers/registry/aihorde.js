export default {
  id: "aihorde",
  display: {
    name: "AI Horde",
    icon: "groups",
    color: "#E11D48",
    textIcon: "AH",
    website: "https://aihorde.net",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://oai.aihorde.net/v1/chat/completions",
    timeoutMs: 120000,
    modelsFetcher: {
      url: "https://oai.aihorde.net/v1/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "aphrodite/TheDrummer/Cydonia-24B-v4.3",
      name: "Cydonia 24B (AI Horde)",
      contextLength: 32768,
      toolCalling: false,
      unsupportedParams: [
        "tools",
        "tool_choice",
        "parallel_tool_calls",
      ],
    },
    {
      id: "aphrodite/TheDrummer/Skyfall-31B-v4.2",
      name: "Skyfall 31B (AI Horde)",
      contextLength: 32768,
      toolCalling: false,
      unsupportedParams: [
        "tools",
        "tool_choice",
        "parallel_tool_calls",
      ],
    },
    {
      id: "google/gemma-4-31b",
      name: "Gemma 4 31B (AI Horde)",
      contextLength: 32768,
      toolCalling: false,
      unsupportedParams: [
        "tools",
        "tool_choice",
        "parallel_tool_calls",
      ],
    },
  ],
  passthroughModels: true,
};
