// ADAPTED STUB — OmniRoute `src/app/api/v1/_shared/audioProviderNodes.ts`
// resolves dynamic audio provider nodes for speech routing. OryphemRouter has
// no dynamic node registry; return an empty list so combo speech falls back
// to the static audio registry.
export function resolveDynamicAudioProviders(_body) {
  return [];
}
