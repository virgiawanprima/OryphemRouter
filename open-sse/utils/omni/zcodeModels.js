/**
 * ADAPTED — ZCODE_MODELS for the ZcodeExecutor (ported from OmniRoute
 * open-sse/config/providers/registry/zcode/index.ts). The GLM effort-alias
 * models (-high/-low/-max) are excluded, matching the source filter.
 */
export const ZCODE_MODELS = [
  { id: "glm-5.3", name: "GLM 5.3", contextLength: 1000000, maxOutputTokens: 131072, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-5.2", name: "GLM 5.2", contextLength: 1000000, maxOutputTokens: 131072, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-5.1", name: "GLM 5.1", contextLength: 204800, maxOutputTokens: 131072, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-5", name: "GLM 5", contextLength: 200000, maxOutputTokens: 131072, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-5-turbo", name: "GLM 5 Turbo", contextLength: 200000, maxOutputTokens: 131072, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-4.7-flash", name: "GLM 4.7 Flash", contextLength: 200000, maxOutputTokens: 131072, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-4.7", name: "GLM 4.7", contextLength: 200000, maxOutputTokens: 131072, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-4.6v", name: "GLM 4.6V (Vision)", contextLength: 128000, maxOutputTokens: 32768, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [], supportsVision: true },
  { id: "glm-4.6", name: "GLM 4.6", contextLength: 200000, maxOutputTokens: 32768, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-4.5v", name: "GLM 4.5V (Vision)", contextLength: 16000, maxOutputTokens: 32768, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [], supportsVision: true },
  { id: "glm-4.5", name: "GLM 4.5", contextLength: 128000, maxOutputTokens: 32768, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
  { id: "glm-4.5-air", name: "GLM 4.5 Air", contextLength: 128000, maxOutputTokens: 32768, toolCalling: true, supportsReasoning: true, supportedThinkingEfforts: [] },
];

export const zcodeProvider = {
  id: "zcode",
  alias: "zc",
  format: "openai",
  executor: "zcode",
  baseUrl: "zcode://app-server/stdio",
  authType: "none",
  authHeader: "none",
  models: ZCODE_MODELS,
};
