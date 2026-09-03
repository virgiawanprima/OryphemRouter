export default {
  id: "wafer",
  alias: "wafer",
  display: {
    name: "Wafer",
    icon: "layers",
    color: "#0F766E",
    textIcon: "WF",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "claude",
    executor: "default",
    baseUrl: "https://pass.wafer.ai/v1/messages",
    headers: {
      "Anthropic-Version": "2023-06-01",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "DeepSeek-V4-Pro",
      name: "DeepSeek V4 Pro",
    },
    {
      id: "MiniMax-M2.7",
      name: "MiniMax M2.7",
    },
    {
      id: "Qwen3.5-397B-A17B",
      name: "Qwen3.5 397B A17B",
    },
    {
      id: "GLM-5.1",
      name: "GLM 5.1",
    },
  ],
};
