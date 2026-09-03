// ADAPTED STUB — OmniRoute `open-sse/executors/base/reasoningEffort.ts`
// normalizes `reasoning_effort` values per provider. This neutral passthrough
// keeps targetRequestSanitizer loadable; effort sanitization for OryphemRouter
// executors is handled in executors/executorUtils.js.
export function sanitizeReasoningEffortForProvider(effort, _provider, _model) {
  return effort;
}
