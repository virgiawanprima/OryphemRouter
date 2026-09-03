const PRESERVE_SYSTEM_PROMPT_MODES = [
  "always",
  "whenNoCache",
  "never"
];
function isPreserveSystemPromptMode(value) {
  return typeof value === "string" && PRESERVE_SYSTEM_PROMPT_MODES.includes(value);
}
function normalizePreserveSystemPromptMode(config) {
  if (isPreserveSystemPromptMode(config.preserveSystemPromptMode)) {
    return config.preserveSystemPromptMode;
  }
  return config.preserveSystemPrompt === false ? "whenNoCache" : "always";
}
function resolvePreserveSystemPrompt(mode, { hasCache }) {
  switch (mode) {
    case "always":
      return true;
    case "never":
      return false;
    case "whenNoCache":
      return hasCache;
  }
}
function modeToBaselineBoolean(mode) {
  return resolvePreserveSystemPrompt(mode, { hasCache: false });
}
export {
  PRESERVE_SYSTEM_PROMPT_MODES,
  isPreserveSystemPromptMode,
  modeToBaselineBoolean,
  normalizePreserveSystemPromptMode,
  resolvePreserveSystemPrompt
};
