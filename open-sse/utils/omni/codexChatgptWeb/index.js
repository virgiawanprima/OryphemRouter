// OryphemRouter adaptation stub for the ChatGPT-Web (Codex) browser adapter.
// The full browser automation stack (playwright Chromium tunnel + MCP tool
// bridge) is not ported; these exports keep the executor module loadable and
// fail with a clear message when a real turn is attempted.

const NOT_PORTED =
  "ChatGPT Web (Codex) browser automation is not available in OryphemRouter — " +
  "the full codex-chatgpt-web vendor stack (playwright tunnel, tool bridge) was not ported.";

export function createChatGptWebAdapter(_provider) {
  const adapter = {
    async runTurn() {
      throw new Error(NOT_PORTED);
    },
  };
  return adapter;
}

export function loginToChatGpt() {
  throw new Error(NOT_PORTED);
}
