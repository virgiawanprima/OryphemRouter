// OryphemRouter adaptation stub for OmniRoute
// executors/chatgpt-web-codex/runtime.ts. Runtime tracking is not ported;
// these exports keep the executor loadable and report zero activity.

import { connectionRuntimePaths } from "./storageState.js";

export function trackChatGptWebCodexRuntime(_worker, _brokerSocketPath) {
  /* no-op */
}

export function getChatGptWebCodexRuntimeCounts() {
  return { activeTurns: 0, waitingTurns: 0, browserWorkers: 0, brokers: 0 };
}

export async function stopChatGptWebCodexRuntime() {
  /* no-op */
}

export function brokerSocketPathForConnection(connectionId) {
  return connectionRuntimePaths(connectionId).brokerSocketPath;
}
