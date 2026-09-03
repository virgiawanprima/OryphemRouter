const VISION_MODEL_ID_FRAGMENTS = [
  "pixtral",
  "llava",
  "bakllava",
  "qwen-vl",
  "qwen2-vl",
  "qwen2.5-vl",
  "qwen3-vl",
  "qvq",
  "internvl",
  "minicpm-v",
  "moondream",
  "mimo-vl",
  "kimi-vl",
  "glm-4v",
  "glm-4.5v",
  "glm-4.6v",
  "gpt-4o",
  "gpt-4.1",
  "gpt-4-turbo",
  "gpt-4-vision",
  "gpt-5",
  "gemini-1.5",
  "gemini-2",
  "gemini-3",
  "gemini-exp",
  "claude-3",
  "claude-fable",
  "claude-opus-4",
  "claude-sonnet-4",
  "claude-haiku-4",
  "claude-fable",
  "mistral-medium-3",
  "minimax-m3",
  "kimi-k2.",
  "-vision",
  "multimodal"
];
function isVisionModelId(modelId) {
  if (!modelId) return false;
  const normalized = String(modelId).toLowerCase();
  return VISION_MODEL_ID_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}
export {
  VISION_MODEL_ID_FRAGMENTS,
  isVisionModelId
};
