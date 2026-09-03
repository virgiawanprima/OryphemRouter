const DASHSCOPE_TEXT_MODEL_PREFIXES = [
  "qwen",
  "qwq-",
  "deepseek-",
  "glm-",
  "kimi-",
  "minimax-"
];
const DASHSCOPE_VISION_MODEL_PREFIXES = ["wan", "qwen-image", "happyhorse", "z-image"];
const DASHSCOPE_NON_TEXT_MODEL_TOKEN = /(?:^|[-_.\/])(?:asr|audio|captioner|embedding|image|livetranslate|omni|ocr|realtime|rerank|s2s|speech|tts|video|vl)(?:$|[-_.\/])/i;
const DASHSCOPE_VISION_MODEL_TOKEN = /(?:^|[-_.\/])(?:i2v|t2v|r2v|vace|kf2v|videoedit|animate|image-edit)(?:$|[-_.\/])/i;
function isDashscopeTextModelId(value) {
  if (typeof value !== "string") return false;
  const modelId = value.trim().toLowerCase();
  if (!modelId || DASHSCOPE_NON_TEXT_MODEL_TOKEN.test(modelId)) return false;
  return DASHSCOPE_TEXT_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix));
}
function isDashscopeVisionModelId(value) {
  if (typeof value !== "string") return false;
  const modelId = value.trim().toLowerCase();
  if (!modelId || isDashscopeTextModelId(modelId)) return false;
  return DASHSCOPE_VISION_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix)) || DASHSCOPE_VISION_MODEL_TOKEN.test(modelId);
}
const DASHSCOPE_AUDIO_PREFIXES = [
  "cosyvoice",
  "fun-asr",
  "qwen-audio",
  "qwen-voice",
  "voice-enrollment"
];
const DASHSCOPE_AUDIO_MODEL_TOKEN = /(?:^|[-_.\/])(?:asr|tts|livetranslate|captioner|speech|voice-design|voice-enrollment)(?:$|[-_.\/])/i;
const DASHSCOPE_MULTIMODAL_MODEL_TOKEN = /(?:^|[-_.\/])omni(?:$|[-_.\/])/i;
function isDashscopeAudioModelId(value) {
  if (typeof value !== "string") return false;
  const modelId = value.trim().toLowerCase();
  if (!modelId) return false;
  return DASHSCOPE_AUDIO_PREFIXES.some((prefix) => modelId.startsWith(prefix)) || DASHSCOPE_AUDIO_MODEL_TOKEN.test(modelId);
}
function isDashscopeMultimodalModelId(value) {
  if (typeof value !== "string") return false;
  const modelId = value.trim().toLowerCase();
  if (!modelId || isDashscopeAudioModelId(modelId) || isDashscopeVisionModelId(modelId)) {
    return false;
  }
  return DASHSCOPE_MULTIMODAL_MODEL_TOKEN.test(modelId);
}
function isAlibabaFreeTierTextComboName(comboName) {
  if (!comboName) return false;
  const normalized = comboName.trim().toLowerCase();
  if (isAlibabaFreeTierVisionComboName(normalized) || isAlibabaFreeTierMultimodalComboName(normalized) || isAlibabaFreeTierAudioComboName(normalized)) {
    return false;
  }
  return normalized === "alibabafree" || normalized.endsWith("alibabafree");
}
function isAlibabaFreeTierVisionComboName(comboName) {
  if (!comboName) return false;
  const normalized = comboName.trim().toLowerCase();
  return normalized === "alibabafreevision" || normalized.endsWith("freevision");
}
function isAlibabaFreeTierMultimodalComboName(comboName) {
  if (!comboName) return false;
  const normalized = comboName.trim().toLowerCase();
  return normalized === "alibabafreemultimodal" || normalized.endsWith("freemultimodal");
}
function isAlibabaFreeTierAudioComboName(comboName) {
  if (!comboName) return false;
  const normalized = comboName.trim().toLowerCase();
  return normalized === "alibabafreeaudio" || normalized.endsWith("freeaudio");
}
export {
  isAlibabaFreeTierAudioComboName,
  isAlibabaFreeTierMultimodalComboName,
  isAlibabaFreeTierTextComboName,
  isAlibabaFreeTierVisionComboName,
  isDashscopeAudioModelId,
  isDashscopeMultimodalModelId,
  isDashscopeTextModelId,
  isDashscopeVisionModelId
};
