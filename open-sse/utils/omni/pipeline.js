// ADAPTED STUB — OmniRoute `src/domain/pipeline.ts` (executePipeline /
// buildPipelineConfig). OryphemRouter has no multi-stage pipeline engine;
// buildPipelineConfig returns a trivial config and executePipeline throws a
// clear marker so pipelineRouter falls through to the caller's normal combo
// handling (pipeline is opt-in and off by default).
export function buildPipelineConfig(promptText, taskType) {
  return { promptText, taskType, stages: [] };
}
export async function executePipeline() {
  throw new Error("PIPELINE_UNAVAILABLE");
}
export default { buildPipelineConfig, executePipeline };
