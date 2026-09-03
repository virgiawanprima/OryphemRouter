// Minimal self-contained adaptation of OmniRoute config/codexIdentity.ts for
// OryphemRouter. Only the native-Codex request verification used by
// chatgpt-web-codex.js is ported (the other 550+ lines are unrelated).

function getHeaderValue(headers, name) {
  if (headers instanceof Headers) {
    return headers.get(name)?.toLowerCase() ?? "";
  }
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name && typeof value === "string") {
        return value.toLowerCase();
      }
    }
  }
  return "";
}

export function isCodexOriginatedHeaders(headers) {
  if (getHeaderValue(headers, "originator").startsWith("codex")) return true;
  return getHeaderValue(headers, "user-agent").startsWith("codex");
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** Require the native Codex thread/turn binding; prompt text and cache keys are not authority. */
export function hasNativeCodexTurnBinding(body) {
  const metadata = asRecord(asRecord(body)?.client_metadata);
  const raw = metadata?.["x-codex-turn-metadata"];
  let turn = asRecord(raw);
  if (typeof raw === "string") {
    try {
      turn = asRecord(JSON.parse(raw));
    } catch {
      return false;
    }
  }
  return (
    typeof turn?.thread_id === "string" &&
    turn.thread_id.trim().length > 0 &&
    typeof turn.turn_id === "string" &&
    turn.turn_id.trim().length > 0
  );
}

export function isVerifiedNativeCodexRequest(body, headers) {
  return isCodexOriginatedHeaders(headers) && hasNativeCodexTurnBinding(body);
}
