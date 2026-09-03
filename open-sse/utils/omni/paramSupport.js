// ADAPTED STUB — OmniRoute `open-sse/translator/paramSupport.ts` strips
// provider-unsupported request parameters during translation. OryphemRouter
// performs its own param stripping in translators; this no-op passthrough
// keeps targetRequestSanitizer loadable and behaviorally neutral.
export function stripUnsupportedParams(body, _provider, _opts = {}) {
  return body;
}
