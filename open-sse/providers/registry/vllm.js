export default {
  id: "vllm",
  alias: "vllm",
  display: {
    name: "vLLM",
    icon: "memory",
    color: "#0F766E",
    textIcon: "VL",
    website: "https://github.com/vllm-project/vllm",
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  transport: {
    baseUrl: "http://localhost:8000/v1",
    format: "openai",
  },
  passthroughModels: true,
};
