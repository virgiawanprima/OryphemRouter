// OryphemRouter adaptation stub for OmniRoute
// executors/chatgpt-web-codex/storageState.ts. Real browser storage-state
// persistence is not ported; paths are derived from DATA_DIR and credential
// state is kept in-memory so the executor remains loadable.

import { join } from "node:path";
import { homedir } from "node:os";

function baseDir() {
  const configured = process.env.DATA_DIR || process.env.OMNIROUTE_DATA_DIR;
  const root = (configured && configured.trim()) || join(homedir(), ".omniroute");
  return join(root, "chatgpt-web-codex");
}

export function connectionRuntimePaths(connectionId) {
  return {
    brokerSocketPath: join(baseDir(), "run", `${connectionId}.sock`),
    threadEnvironmentStatePath: join(baseDir(), "state", `${connectionId}.env.json`),
  };
}

export function storageStatePathForConnection(connectionId) {
  return join(baseDir(), "state", `${connectionId}.storage-state.json`);
}

/** Returns a stable path; the cookie-based storage state is not persisted on disk. */
export function ensureConnectionStorageStateFromCredential(connectionId, _secrets) {
  return storageStatePathForConnection(connectionId);
}

export function readConnectionStorageState(_path) {
  return null;
}
