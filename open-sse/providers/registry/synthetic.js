export default {
  id: "synthetic",
  priority: 300,
  alias: "synthetic",
  aliases: ["syn:gpt-oss-120b"],

  display: {
    name: "synthetic",
    color: "#64748B",
    textIcon: "SY",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.synthetic.new/openai/v1/chat/completions",
    validateUrl: "https://api.synthetic.new/openai/v1/models",

  },
  passthroughModels: true,

  models: [
  {
    "id": "hf:openai/gpt-oss-120b",
    "name": "openai/gpt-oss-120b",
    "contextLength": 131072
  },
  {
    "id": "hf:zai-org/GLM-5.2",
    "name": "zai-org/GLM-5.2",
    "contextLength": 524288
  },
  {
    "id": "hf:moonshotai/Kimi-K2.7-Code",
    "name": "moonshotai/Kimi-K2.7-Code",
    "contextLength": 262144
  },
  {
    "id": "hf:Qwen/Qwen3.6-27B",
    "name": "Qwen/Qwen3.6-27B",
    "contextLength": 262144
  },
  {
    "id": "hf:MiniMaxAI/MiniMax-M3",
    "name": "MiniMaxAI/MiniMax-M3",
    "contextLength": 262144
  },
  {
    "id": "hf:zai-org/GLM-4.7-Flash",
    "name": "zai-org/GLM-4.7-Flash",
    "contextLength": 196608
  },
  {
    "id": "hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
    "name": "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
    "contextLength": 262144
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
