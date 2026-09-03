// ADAPTED STUB — OmniRoute `src/app/api/v1/_shared/videoModelResolution.ts`
// resolves video model targets and checks prompt-optional I2V models. Minimal
// port used by videoCombo; custom-model registry lookup is not available in
// OryphemRouter so only built-in provider/model parsing is honored.
export async function resolveVideoModelTarget(modelStr) {
  if (!modelStr) return { provider: null, model: null, isCustomModel: false };
  const slash = String(modelStr).indexOf("/");
  if (slash > 0) {
    return {
      provider: String(modelStr).slice(0, slash),
      model: String(modelStr).slice(slash + 1),
      isCustomModel: false,
    };
  }
  return { provider: null, model: String(modelStr), isCustomModel: false };
}

export function isVideoPromptOptional(parsed) {
  const provider = parsed?.provider;
  const model = parsed?.model;
  return (
    (model === "happyhorse-1.1-i2v" &&
      (provider === "alibaba" ||
        provider === "bailian-coding-plan" ||
        provider === "qwen-cloud-token-plan" ||
        provider === "qwen-cloud")) ||
    (provider === "qwen-cloud" && model === "wan2.7-i2v") ||
    (provider === "alibaba" &&
      (model === "wan2.7-i2v-2026-04-25" || model === "wan2.6-i2v-flash"))
  );
}

export async function resolveLocalOverrideCredentials(_provider) {
  return null;
}
