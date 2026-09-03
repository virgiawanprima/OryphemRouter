import { createHmac, randomUUID } from "node:crypto";
import {
  createAgenticConversation,
  findAgenticConversationsByFingerprint,
  getConversationTurnIndex,
  insertConversationTurnNodes,
  touchOrCreateExternalConversation,
  updateAgenticConversation
} from "../utils/omni/agenticConversationsDb.js";
function normalizeRole(raw) {
  if (raw === "system" || raw === "user" || raw === "assistant" || raw === "tool") return raw;
  if (raw === "developer") return "system";
  if (raw === "model") return "assistant";
  if (raw === "function") return "tool";
  return "user";
}
function stringifyContent(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      const block = item && typeof item === "object" ? item : null;
      if (!block) continue;
      const type = block.type;
      if ((type === "text" || type === "input_text" || type === "output_text") && typeof block.text === "string") {
        parts.push(block.text);
      } else if (type === "tool_use" || type === "function_call") {
        const name = typeof block.name === "string" ? block.name : "";
        parts.push(`[tool_use ${name}]`);
      } else if (type === "tool_result" || type === "function_call_output") {
        parts.push(stringifyContent(block.content ?? block.output ?? ""));
      } else if (typeof block.text === "string") {
        parts.push(block.text);
      }
    }
    return parts.join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}
function extractCanonicalTurns(body) {
  if (!body || typeof body !== "object") return [];
  let raw;
  if (Array.isArray(body.messages)) {
    raw = body.messages;
  } else if (Array.isArray(body.input)) {
    raw = body.input;
  } else if (typeof body.input === "string") {
    raw = [{ role: "user", content: body.input }];
  } else if (body.input && typeof body.input === "object") {
    raw = [body.input];
  } else {
    raw = [];
  }
  const turns = [];
  for (const item of raw) {
    const rec = item && typeof item === "object" ? item : {};
    const role = rec.role ? normalizeRole(rec.role) : rec.type === "function_call" || rec.type === "function_call_output" ? "tool" : null;
    if (!role) continue;
    const text = stringifyContent(rec.content ?? rec.text ?? rec.arguments ?? rec.output);
    if (!text) continue;
    let blockKind = "text";
    let toolName = null;
    if (rec.type === "function_call") {
      blockKind = "tool_use";
      toolName = typeof rec.name === "string" ? rec.name : null;
    } else if (rec.type === "function_call_output") {
      blockKind = "tool_result";
    } else if (rec.role === "tool" || rec.role === "function") {
      blockKind = "tool_result";
      toolName = typeof rec.name === "string" ? rec.name : null;
    }
    turns.push({ role, text, blockKind, toolName });
  }
  return turns;
}
function hashHex(text) {
  return createHmac("sha256", "omniroute-conversation-fingerprint-v1").update(text).digest("hex");
}
function extractToolNames(body) {
  if (!body || !Array.isArray(body.tools)) return [];
  const names = [];
  for (const tool of body.tools) {
    const rec = tool && typeof tool === "object" ? tool : {};
    const fn = rec.function && typeof rec.function === "object" ? rec.function : {};
    const name = typeof rec.name === "string" ? rec.name : typeof fn.name === "string" ? fn.name : "";
    if (name) names.push(name);
  }
  return names.sort();
}
function computeFingerprintHash(input) {
  const parts = [input.apiKeyId ?? "", input.model ?? "", input.toolNames.join(",")];
  return hashHex(parts.join("|"));
}
function hashTurnContent(turn) {
  return hashHex(`${turn.role} ${turn.text}`);
}
const DEFAULT_RECONNECT_MAX_STEPS = 15e4;
function chainNodeIdFromHash(parentId, turnHash) {
  return hashHex(`${parentId} ${turnHash}`);
}
function chainNodeId(parentId, turn) {
  return chainNodeIdFromHash(parentId, hashTurnContent(turn));
}
function buildNewNodes(turns, fromIndex, chainAnchor, rootId, turnHashes) {
  const nodes = [];
  let parent = chainAnchor;
  for (let i = fromIndex; i < turns.length; i++) {
    const turnHash = turnHashes ? turnHashes[i] : hashTurnContent(turns[i]);
    const nodeId = chainNodeIdFromHash(parent, turnHash);
    nodes.push({
      id: nodeId,
      // The root anchor is a hashing seed, not a real node — the first turn
      // of a tree has no parent turn.
      parentId: parent === rootId ? null : parent,
      role: turns[i].role,
      contentHash: turnHash
    });
    parent = nodeId;
  }
  return nodes;
}
function findReconnectMatch(chainTurns, index, options = {}) {
  const turnHashes = options.turnHashes ?? chainTurns.map(hashTurnContent);
  const budget = options.budget ?? {
    stepsLeft: options.maxSteps ?? DEFAULT_RECONNECT_MAX_STEPS,
    stepsUsed: 0
  };
  let best = null;
  for (let s = 0; s < chainTurns.length; s++) {
    if (budget.stepsLeft <= 0) break;
    const anchors = index.byContentHash.get(turnHashes[s]);
    if (!anchors) continue;
    for (const anchorNodeId of anchors) {
      if (budget.stepsLeft <= 0) break;
      budget.stepsLeft -= 1;
      budget.stepsUsed += 1;
      let parent = anchorNodeId;
      let matchEndIndex = s + 1;
      while (matchEndIndex < chainTurns.length && budget.stepsLeft > 0) {
        budget.stepsLeft -= 1;
        budget.stepsUsed += 1;
        const nodeId = chainNodeIdFromHash(parent, turnHashes[matchEndIndex]);
        if (!index.nodeIds.has(nodeId)) break;
        parent = nodeId;
        matchEndIndex++;
      }
      const anchorHasChild = index.parentsWithChildren.has(parent);
      const isBetter = !best || matchEndIndex > best.matchEndIndex || matchEndIndex === best.matchEndIndex && !anchorHasChild && best.anchorHasChild;
      if (isBetter) {
        best = { startIndex: s, matchEndIndex, anchorNodeId: parent, anchorHasChild };
      }
      if (best && best.matchEndIndex === chainTurns.length) {
        return { match: best, stepsUsed: budget.stepsUsed };
      }
    }
  }
  return { match: best, stepsUsed: budget.stepsUsed };
}
const MAX_STORED_ID_LENGTH = 128;
async function resolveConversationId(input) {
  if (input.clientSessionIdHeader && input.clientSessionIdHeader.trim()) {
    const id2 = input.clientSessionIdHeader.trim().slice(0, MAX_STORED_ID_LENGTH);
    touchOrCreateExternalConversation(id2, { apiKeyId: input.apiKeyId });
    return { conversationId: id2, isNewConversation: false };
  }
  const turns = extractCanonicalTurns(input.body);
  const toolNames = extractToolNames(input.body);
  const fingerprintHash = computeFingerprintHash({
    apiKeyId: input.apiKeyId,
    model: input.model,
    toolNames
  });
  const chainTurns = turns.filter((t) => t.role !== "system");
  const turnHashes = chainTurns.map(hashTurnContent);
  const walkBudget = { stepsLeft: DEFAULT_RECONNECT_MAX_STEPS, stepsUsed: 0 };
  const candidates = findAgenticConversationsByFingerprint(fingerprintHash);
  for (const candidate of candidates) {
    const index = getConversationTurnIndex(candidate.id);
    if (index.nodeIds.size === 0) continue;
    const { match } = findReconnectMatch(chainTurns, index, {
      turnHashes,
      budget: walkBudget
    });
    if (!match) continue;
    if (match.matchEndIndex === chainTurns.length) {
      updateAgenticConversation(candidate.id, { turnCount: candidate.turnCount + 1 });
      return { conversationId: candidate.id, isNewConversation: false };
    }
    if (!match.anchorHasChild) {
      const newNodes = buildNewNodes(
        chainTurns,
        match.matchEndIndex,
        match.anchorNodeId,
        candidate.id,
        turnHashes
      );
      insertConversationTurnNodes(candidate.id, input.correlationId, newNodes);
      updateAgenticConversation(candidate.id, { turnCount: candidate.turnCount + 1 });
      return { conversationId: candidate.id, isNewConversation: false };
    }
  }
  const id = `conv_${randomUUID()}`;
  createAgenticConversation({ id, apiKeyId: input.apiKeyId, fingerprintHash });
  insertConversationTurnNodes(
    id,
    input.correlationId,
    buildNewNodes(chainTurns, 0, id, id, turnHashes)
  );
  return { conversationId: id, isNewConversation: true };
}
export {
  DEFAULT_RECONNECT_MAX_STEPS,
  computeFingerprintHash,
  extractCanonicalTurns,
  findReconnectMatch,
  hashTurnContent,
  resolveConversationId
};
