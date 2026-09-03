import { createCompressionStats } from "../../stats.js";
import { RELEVANCE_SCHEMA, validateRelevanceConfig, resolveRelevanceConfig } from "./configSchema.js";
import { scoreSentences } from "./scorer.js";
const SENTENCE_PRESERVE_RE = /\d|https?:\/\/|(?:Error|Exception|TypeError|RangeError|SyntaxError|ReferenceError|Traceback):|```|^\s*at\s|\/[\w.-]+\/|\w+=\S/i;
const SENTENCE_SPLIT_RE = /(?<=[.!?]\s)/;
function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (block && typeof block === "object" && "text" in block) {
        return String(block.text);
      }
      return "";
    }).join(" ");
  }
  return "";
}
function splitSentences(text) {
  return text.split(SENTENCE_SPLIT_RE).filter((s) => s.trim().length > 0);
}
function applyRelevanceToText(text, query, cfg) {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return { result: text, changed: false };
  const scores = scoreSentences(sentences, query, cfg);
  const totalChars = text.length;
  const budget = Math.floor(totalChars * cfg.budgetPercent);
  const indexed = sentences.map((s, i) => ({ s, i, score: scores[i] }));
  const sorted = [...indexed].sort((a, b) => b.score - a.score);
  const keepSet = /* @__PURE__ */ new Set();
  for (const { s, i } of indexed) {
    if (SENTENCE_PRESERVE_RE.test(s)) keepSet.add(i);
  }
  let kept = 0;
  for (const { s, i, score } of sorted) {
    if (keepSet.has(i)) continue;
    if (kept >= budget) break;
    if (score >= cfg.overlapThreshold) {
      keepSet.add(i);
      kept += s.length + 1;
    }
  }
  if (keepSet.size === 0 && sorted.length > 0) keepSet.add(sorted[0].i);
  if (keepSet.size === sentences.length) return { result: text, changed: false };
  const ordered = indexed.filter(({ i }) => keepSet.has(i)).sort((a, b) => a.i - b.i);
  const result = ordered.map(({ s }) => s).join("");
  return { result, changed: result !== text };
}
const relevanceEngine = {
  id: "relevance",
  name: "Relevance",
  description: "Extractive sentence scoring against the last user query.",
  icon: "target",
  targets: ["messages"],
  stackable: true,
  stackPriority: 18,
  metadata: {
    id: "relevance",
    name: "Relevance",
    description: "Extractive sentence scoring against the last user query.",
    inputScope: "messages",
    targetLatencyMs: 2,
    supportsPreview: true,
    stable: true
  },
  apply(body, options) {
    try {
      const messages = body.messages;
      if (!Array.isArray(messages)) return { body, compressed: false, stats: null };
      const cfg = resolveRelevanceConfig(options?.stepConfig ?? {});
      let query = "";
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "user") {
          query = extractText(msg.content).trim();
          break;
        }
      }
      if (!query) return { body, compressed: false, stats: null };
      let anyChanged = false;
      const newMessages = messages.map((msg) => {
        const m = msg;
        if (m.role !== "user") return msg;
        if (typeof m.content === "string") {
          const { result, changed } = applyRelevanceToText(m.content, query, cfg);
          if (!changed) return msg;
          anyChanged = true;
          return { ...m, content: result };
        }
        if (Array.isArray(m.content)) {
          const textBlocks = m.content.filter(
            (b) => b && typeof b === "object" && "text" in b
          );
          if (textBlocks.length !== 1) return msg;
          const { result, changed } = applyRelevanceToText(
            String(textBlocks[0].text),
            query,
            cfg
          );
          if (!changed) return msg;
          anyChanged = true;
          const newContent = m.content.map(
            (block) => block === textBlocks[0] ? { ...block, text: result } : block
          );
          return { ...m, content: newContent };
        }
        return msg;
      });
      if (!anyChanged) return { body, compressed: false, stats: null };
      const newBody = { ...body, messages: newMessages };
      const stats = createCompressionStats(body, newBody, "stacked", ["relevance-extract"]);
      return { body: newBody, compressed: true, stats };
    } catch {
      return { body, compressed: false, stats: null };
    }
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config });
  },
  getConfigSchema() {
    return RELEVANCE_SCHEMA;
  },
  validateConfig(config) {
    return validateRelevanceConfig(config);
  }
};
export {
  relevanceEngine
};
