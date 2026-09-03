function isBuiltinStackedPipeline(pipeline) {
  if (!Array.isArray(pipeline) || pipeline.length !== 2) return false;
  const [first, second] = pipeline;
  return first?.engine === "rtk" && (first.intensity === void 0 || first.intensity === "standard") && !first.config && second?.engine === "caveman" && (second.intensity === void 0 || second.intensity === "full") && !second.config;
}
function isStackedCompressionCombo(compressionCombo) {
  return Boolean(compressionCombo && compressionCombo.pipeline.length >= 1);
}
export {
  isBuiltinStackedPipeline,
  isStackedCompressionCombo
};
