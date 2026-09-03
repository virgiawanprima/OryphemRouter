const CONTEXT_1M_SUPPORTED_MODELS = [
  "claude-fable-5",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6"
];
function modelSupportsContext1mBeta(model) {
  const normalizedModel = String(model || "").trim().toLowerCase().replace(/-\d{8}$/, "");
  return CONTEXT_1M_SUPPORTED_MODELS.some(
    (supported) => normalizedModel === supported || normalizedModel.startsWith(`${supported}-`)
  );
}
export {
  CONTEXT_1M_SUPPORTED_MODELS,
  modelSupportsContext1mBeta
};
