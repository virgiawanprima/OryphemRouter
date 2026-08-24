export default {
  id: "morph",
  alias: "morph",
  aliases: ["morphllm"],
  uiAlias: "morph",
  display: {
    name: "Morph",
    icon: "change_history",
    color: "#14B8A6",
    textIcon: "MP",
    website: "https://morphllm.com",
    notice: { apiKeyUrl: "https://morphllm.com" },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.morphllm.com/v1/chat/completions",
    validateUrl: "https://api.morphllm.com/v1/models",
  },
  models: [
    { id: "morph-v3-large", name: "Morph v3 Large" },
    { id: "morph-v3-fast", name: "Morph v3 Fast" },
    // Morph gateway tokens mapped to the real underlying model ids (wire keeps the token).
    { id: "qwen3.5-397b-a17b", name: "Qwen 3.5 397B (A17B)", contextLength: 262144, upstreamModelId: "morph-qwen35-397b" },
    { id: "minimax-m2.7", name: "MiniMax M2.7", contextLength: 200704, upstreamModelId: "morph-minimax27-230b" },
    { id: "qwen3.6-27b", name: "Qwen 3.6 27B", contextLength: 262144, upstreamModelId: "morph-qwen36-27b" },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextLength: 1048576, upstreamModelId: "morph-dsv4flash" },
  ],
};
