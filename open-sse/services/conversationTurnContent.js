import { getDbInstance } from "../utils/omni/dbCore.js";
import { readCallArtifact } from "../utils/omni/callLogArtifacts.js";
import { extractCanonicalTurns, hashTurnContent } from "./conversationTracker.js";
function resolveTurnDisplayContent(nodes) {
  const result = /* @__PURE__ */ new Map();
  const correlationIds = [
    ...new Set(nodes.map((n) => n.lastCorrelationId).filter((v) => !!v))
  ];
  if (correlationIds.length === 0) return result;
  const db = getDbInstance();
  const placeholders = correlationIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT correlation_id, artifact_relpath FROM call_logs
       WHERE correlation_id IN (${placeholders}) AND artifact_relpath IS NOT NULL
       ORDER BY timestamp ASC`
  ).all(...correlationIds);
  const artifactPathByCorrelationId = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!artifactPathByCorrelationId.has(row.correlation_id)) {
      artifactPathByCorrelationId.set(row.correlation_id, row.artifact_relpath);
    }
  }
  for (const relPath of artifactPathByCorrelationId.values()) {
    const { artifact, state } = readCallArtifact(relPath);
    if (state !== "ready") continue;
    const clientRawRequest = artifact?.pipeline?.clientRawRequest;
    const body = clientRawRequest?.body;
    if (!body || typeof body !== "object") continue;
    for (const turn of extractCanonicalTurns(body)) {
      const hash = hashTurnContent(turn);
      if (result.has(hash)) continue;
      result.set(hash, {
        textPreview: turn.text,
        blockKind: turn.blockKind,
        toolName: turn.toolName
      });
    }
  }
  return result;
}
export {
  resolveTurnDisplayContent
};
