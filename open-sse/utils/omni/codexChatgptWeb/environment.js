// Minimal self-contained adaptation of OmniRoute
// vendor/codex-chatgpt-web/adapters/chatgpt-web/environment.ts for
// OryphemRouter. Only extractChatGptTurnIdentity is ported.

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function clientTurnMetadata(parsed) {
  const body = record(parsed?._rawBody);
  const metadata = record(body?.client_metadata);
  const raw = metadata?.["x-codex-turn-metadata"];
  if (typeof raw === "string") {
    try {
      return record(JSON.parse(raw));
    } catch {
      return undefined;
    }
  }
  return record(raw);
}

/** Extract the native Codex thread/turn identity from a parsed request. */
export function extractChatGptTurnIdentity(parsed) {
  const body = record(parsed?._rawBody);
  const metadata = clientTurnMetadata(parsed);
  return {
    ...(typeof metadata?.thread_id === "string" ? { threadId: metadata.thread_id } : {}),
    ...(typeof metadata?.turn_id === "string" ? { turnId: metadata.turn_id } : {}),
    ...(typeof body?.prompt_cache_key === "string"
      ? { promptCacheKey: body.prompt_cache_key }
      : {}),
  };
}
