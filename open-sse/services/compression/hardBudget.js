import { scoreToken } from "./ultraHeuristic.js";
import {
  countTextTokens,
  tokenizerContextFromBody
} from "../../utils/omni/tiktokenCounter.js";
import { createCompressionStats } from "./stats.js";
const UNIT_PRESERVE_RE = /\d|https?:\/\/|(?:Error|Exception|TypeError|RangeError|SyntaxError|ReferenceError|Traceback):|```|^\s*at\s|\/[\w.-]+\/|[A-Za-z_]\w*=\S/i;
function scoreUnit(unit) {
  const words = unit.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0.5;
  const total = words.reduce((sum, w) => sum + scoreToken(w), 0);
  return total / words.length;
}
function mustPreserve(unit) {
  return UNIT_PRESERVE_RE.test(unit);
}
function splitUnits(text) {
  return text.split(/\n/).flatMap((line) => {
    if (line.trim() === "") return [line];
    if (!UNIT_PRESERVE_RE.test(line) && line.length > 60) {
      const sentences = line.split(/(?<=[.!?])\s+/);
      return sentences.length > 1 ? sentences : [line];
    }
    return [line];
  });
}
function tagUnits(units, tokenizerContext) {
  return units.map((u, i) => ({
    i,
    u,
    tokens: countTextTokens(u, tokenizerContext),
    score: scoreUnit(u),
    preserve: mustPreserve(u)
  }));
}
function dropToTarget(tagged, targetTokens) {
  const dropped = /* @__PURE__ */ new Set();
  let tokCount = tagged.reduce((s, x) => s + x.tokens, 0);
  const candidates = tagged.filter((x) => !x.preserve).sort((a, b) => a.score - b.score);
  for (const candidate of candidates) {
    if (tokCount <= targetTokens) break;
    dropped.add(candidate.i);
    tokCount -= candidate.tokens;
  }
  return dropped;
}
function rebuildText(tagged, dropped) {
  return tagged.filter((x) => !dropped.has(x.i)).map((x) => x.u).join("\n");
}
function compressText(text, targetTokens, tokenizerContext) {
  const currentTokens = countTextTokens(text, tokenizerContext);
  if (currentTokens <= targetTokens) return text;
  const units = splitUnits(text);
  if (units.length <= 1) return text;
  const tagged = tagUnits(units, tokenizerContext);
  const dropped = dropToTarget(tagged, targetTokens);
  if (dropped.size === 0) return text;
  return rebuildText(tagged, dropped);
}
function extractMessages(body) {
  const msgs = body.messages;
  if (!Array.isArray(msgs)) return [];
  return msgs;
}
function applyHardBudget(body, opts) {
  const { targetTokens, targetRatio } = opts;
  if (targetTokens == null && targetRatio == null) {
    return { body, compressed: false, stats: null };
  }
  const messages = extractMessages(body);
  if (messages.length === 0) return { body, compressed: false, stats: null };
  const tokenizerContext = tokenizerContextFromBody(body);
  const totalText = messages.map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join(" ");
  const totalTokens = countTextTokens(totalText, tokenizerContext);
  const effectiveTarget = targetTokens != null ? targetTokens : Math.floor(totalTokens * targetRatio);
  if (totalTokens <= effectiveTarget) {
    return { body, compressed: false, stats: null };
  }
  const newMessages = messages.map((m) => {
    if (typeof m.content !== "string") return m;
    const msgTokens = countTextTokens(m.content, tokenizerContext);
    const perMsgTarget = totalTokens > 0 ? Math.floor(effectiveTarget * (msgTokens / totalTokens)) : effectiveTarget;
    const out = compressText(m.content, perMsgTarget, tokenizerContext);
    return out === m.content ? m : { ...m, content: out };
  });
  const changed = newMessages.some((m, i) => JSON.stringify(m) !== JSON.stringify(messages[i]));
  const usedMessages = changed ? newMessages : messages;
  const resultTokens = countTextTokens(
    usedMessages.map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join(" "),
    tokenizerContext
  );
  const overBudget = resultTokens > effectiveTarget;
  if (!changed && !overBudget) {
    return { body, compressed: false, stats: null };
  }
  const newBody = changed ? { ...body, messages: newMessages } : body;
  const stats = createCompressionStats(body, newBody, "stacked", ["hard-budget"]);
  if (overBudget) {
    const warning = `hard-budget: could not reach target (${resultTokens} > ${effectiveTarget}; preserved content exceeds budget)`;
    stats.validationWarnings = [...stats.validationWarnings ?? [], warning];
  }
  return { body: newBody, compressed: changed, stats };
}
export {
  applyHardBudget
};
