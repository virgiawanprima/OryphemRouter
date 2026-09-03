// ADAPTED STUB — OmniRoute `src/lib/usage/callLogArtifacts.ts` reads call-log
// artifacts from the operator DB. OryphemRouter has no artifact store; return
// an empty result so conversationTurnContent degrades gracefully.
export function readCallArtifact(_relPath) {
  return { artifact: null, state: null };
}
