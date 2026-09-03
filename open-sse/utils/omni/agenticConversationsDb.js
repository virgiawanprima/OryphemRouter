// ADAPTATION for OryphemRouter.
// OmniRoute's `src/lib/db/agenticConversations.ts` persists agentic conversation trees in
// SQLite. Deep app infra — this is an in-memory fallback so `conversationTracker` loads
// and works within a single process lifetime.

const _conversations = new Map(); // fingerprint -> conversation
const _turns = new Map(); // fingerprint -> node[]
let _seq = 1;

export function createAgenticConversation(data) {
  const conv = {
    id: data.id ?? `conv_${_seq++}`,
    fingerprint: data.fingerprint,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...data,
  };
  _conversations.set(conv.fingerprint, conv);
  return conv;
}

export function findAgenticConversationsByFingerprint(fingerprint) {
  const conv = _conversations.get(fingerprint);
  return conv ? [conv] : [];
}

export function getConversationTurnIndex(fingerprint) {
  const turns = _turns.get(fingerprint) ?? [];
  return turns.length;
}

export function insertConversationTurnNodes(fingerprint, nodes) {
  const turns = _turns.get(fingerprint) ?? [];
  const start = turns.length;
  for (const [i, node] of (nodes ?? []).entries()) {
    turns.push({ ...node, index: start + i });
  }
  _turns.set(fingerprint, turns);
  return turns.length;
}

export function touchOrCreateExternalConversation(fingerprint, data) {
  const existing = _conversations.get(fingerprint);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }
  return createAgenticConversation({ fingerprint, ...data });
}

export function updateAgenticConversation(fingerprint, patch) {
  const conv = _conversations.get(fingerprint);
  if (!conv) return null;
  Object.assign(conv, patch, { updatedAt: Date.now() });
  return conv;
}
