// OryphemRouter adaptation stub for the ChatGPT-Web (Codex) browser worker.
// The playwright-backed Chromium worker is not ported; the class shape is kept
// so trackChatGptWebCodexRuntime / the executor can reference it without a
// load-time failure.

const NOT_PORTED =
  "ChatGPT Web (Codex) browser worker is not available in OryphemRouter — " +
  "the full codex-chatgpt-web vendor stack was not ported.";

export class ChatGptBrowserWorker {
  static forProvider(_provider) {
    return new ChatGptBrowserWorker();
  }

  async close() {
    /* no-op */
  }

  run() {
    throw new Error(NOT_PORTED);
  }
}
