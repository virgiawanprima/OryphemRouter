// Adapted from OmniRoute services/chatgptWebCodexAdmin.ts (admin/dashboard boundary).
// NOTE: doctor.ts and the vendor browser-login module are not ported to
// OryphemRouter; getChatGptWebCodexDoctorStatus is a degraded best-effort status.
import { existsSync, readFileSync, access } from "node:fs";
import {
  decodeChatGptWebCodexSecrets,
  encodeChatGptWebCodexSecrets
} from "../executors/chatgpt-web-codex/credentials.js";
import { getChatGptWebCodexRuntimeCounts } from "../executors/chatgpt-web-codex/runtime.js";
import { connectionRuntimePaths, storageStatePathForConnection } from "../executors/chatgpt-web-codex/storageState.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";

export { decodeChatGptWebCodexSecrets, encodeChatGptWebCodexSecrets };

// Degraded doctor status — OmniRoute's doctor.ts (chrome detection + browser-login
// probe + tunnel health) is not ported; we report storage-state and runtime facts.
export async function getChatGptWebCodexDoctorStatus(connection = {}) {
  const connectionId = typeof connection.id === "string" ? connection.id : "";
  let storageState = false;
  let credential = false;
  try {
    const secrets = decodeChatGptWebCodexSecrets(String(connection.apiKey || ""));
    credential = Boolean(secrets && secrets.storageState);
    const paths = connectionRuntimePaths(connectionId);
    storageState = await access(paths.storageStatePath).then(() => true).catch(() => false);
  } catch {
    credential = false;
  }
  const runtime = getChatGptWebCodexRuntimeCounts();
  return {
    browser: { ready: false, mode: "unavailable" },
    storageState: { ready: storageState && credential },
    login: { ready: false },
    temporaryChats: { ready: false },
    tunnelBinary: { ready: false },
    tunnel: { ok: false, processRunning: false, healthy: false, detail: "not checked" },
    connector: { ready: false },
    toolRoundtrip: { ready: false },
    runtime,
    lease: { total: 0, used: 0, available: 0 },
    proAvailable: false,
    recovery: { interactiveLoginRequired: storageState && !credential },
    lastError:
      typeof connection.lastError === "string" && connection.lastError.trim()
        ? sanitizeErrorMessage(connection.lastError)
        : null
  };
}

// Degraded finalize: validates basic shape and returns the credential rewritten
// to v2 with the (already written) storage-state file path marker if present.
export function finalizeValidatedChatGptWebCodexSecrets(encodedCredential, validationId) {
  const parsed = JSON.parse(encodedCredential);
  const rawCookie = typeof parsed.cookie === "string" ? parsed.cookie : "";
  if (!rawCookie) throw new Error("A fresh ChatGPT Cookie is required for browser validation");
  if (!/^validation-[a-f0-9]{24}$/.test(String(validationId || ""))) {
    throw new Error("ChatGPT browser validation reference is invalid");
  }
  let storageState = null;
  try {
    const p = storageStatePathForConnection(validationId);
    if (existsSync(p)) storageState = JSON.parse(readFileSync(p, "utf8"));
  } catch { /* storage state unavailable — degraded */ }
  const runtimeKey = typeof parsed.runtimeKey === "string" ? parsed.runtimeKey.trim() : "";
  return {
    encodedCredential: JSON.stringify({
      version: 2,
      storageState,
      ...(runtimeKey ? { runtimeKey } : {})
    }),
    storageState
  };
}
