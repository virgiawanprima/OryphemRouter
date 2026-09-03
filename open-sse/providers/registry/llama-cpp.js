export default {
  id: "llama-cpp",
  alias: "llamacpp",
  display: {
    name: "llama.cpp",
    icon: "memory",
    color: "#795548",
    textIcon: "LC",
    website: "https://github.com/ggml-org/llama.cpp",
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  transport: {
    baseUrl: "http://127.0.0.1:8080/v1",
    format: "openai",
  },
  passthroughModels: true,
};
