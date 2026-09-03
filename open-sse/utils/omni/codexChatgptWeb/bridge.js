// OryphemRouter adaptation stub for the ChatGPT-Web (Codex) Responses bridge
// (SSE bridging / JSON response building). Not ported; keeps the executor
// loadable and fails clearly when invoked.

const NOT_PORTED =
  "ChatGPT Web (Codex) response bridging is not available in OryphemRouter — " +
  "the full codex-chatgpt-web vendor stack was not ported.";

export function bridgeToResponsesSSE() {
  throw new Error(NOT_PORTED);
}

export function buildResponseJSON() {
  throw new Error(NOT_PORTED);
}
