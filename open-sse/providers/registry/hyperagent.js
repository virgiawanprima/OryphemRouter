export default {
  id: "hyperagent",
  alias: "ha",
  display: {
    name: "HyperAgent",
    icon: "flash_on",
    color: "#F59E0B",
    textIcon: "HA",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "hyperagent",
    baseUrl: "https://hyperagent.com/api/threads",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "fable-latest",
      name: "Fable 5",
      contextLength: 1000000,
    },
    {
      id: "claude-fable-5",
      name: "Claude Fable 5",
      contextLength: 1000000,
    },
    {
      id: "opus-latest",
      name: "Claude Opus Latest",
      contextLength: 1000000,
    },
    {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      contextLength: 1000000,
    },
    {
      id: "sonnet-latest",
      name: "Claude Sonnet Latest",
      contextLength: 1000000,
    },
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      contextLength: 1000000,
    },
  ],
  passthroughModels: true,
};
