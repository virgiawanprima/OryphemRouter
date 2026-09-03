export default {
  id: "tencent-aistudio-web",
  alias: "tasw",
  display: {
    name: "Tencent AI Studio Web",
    icon: "web",
    color: "#006EFF",
    textIcon: "TAS",
    website: "https://yuanbao.tencent.com",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "tencent-aistudio-web",
    baseUrl: "https://aistudio.tencent.ai/api/chat",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "hy3-g",
      name: "HY3-G (via Tencent AI Studio)",
      toolCalling: false,
    },
    {
      id: "hunyuan-default",
      name: "Hunyuan Default (via Tencent AI Studio)",
      toolCalling: false,
    },
    {
      id: "hunyuan-3d",
      name: "Hunyuan 3D (via Tencent AI Studio)",
      toolCalling: false,
    },
  ],
};
