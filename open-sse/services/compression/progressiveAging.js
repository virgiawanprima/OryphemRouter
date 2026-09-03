import { DEFAULT_AGGRESSIVE_CONFIG } from "./types.js";
import { applyLiteCompression } from "./lite.js";
import { cavemanCompress } from "./caveman.js";
import { extractTextContent, replaceTextContent } from "./messageContent.js";
const COMPRESSED_MARKER_RE = /^\[COMPRESSED:/;
const JSON_PREFIX_RE = /^\s*[{[]/;
const FENCE_RE = /^\s*```/;
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function structuredKind(text) {
  const trimmed = text.trim();
  if (FENCE_RE.test(trimmed) && trimmed.endsWith("```")) return "fenced";
  if (JSON_PREFIX_RE.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return null;
    }
  }
  return null;
}
function tagAged(tier, originalText, compressed) {
  const kind = structuredKind(originalText);
  if (kind === "json") {
    return originalText;
  }
  if (kind === "fenced") {
    return `[COMPRESSED:aging:${tier}]
${originalText}`;
  }
  return `[COMPRESSED:aging:${tier}] ${compressed}`;
}
function setContent(msg, newContent) {
  return replaceTextContent(msg, newContent);
}
function applyAging(messages, thresholds, summarizer, preserveSystemPrompt = true, spareUserIndex) {
  const t = thresholds ?? DEFAULT_AGGRESSIVE_CONFIG.thresholds;
  const sum = summarizer ?? {
    summarize: (msgs) => {
      const typed2 = msgs;
      const last = typed2.filter((m) => m.role === "assistant").pop();
      return last ? extractTextContent(last.content).slice(0, 200) : "";
    }
  };
  const typed = messages;
  if (typed.length === 0) return { messages: [], saved: 0 };
  const lastUserIdx = spareUserIndex !== void 0 ? spareUserIndex : typed.findLastIndex((m) => m.role === "user");
  const totalMessages = typed.length;
  const result = [];
  let saved = 0;
  for (let i = 0; i < typed.length; i++) {
    const msg = typed[i];
    const text = extractTextContent(msg.content);
    if (preserveSystemPrompt && msg.role === "system" || COMPRESSED_MARKER_RE.test(text) || i === lastUserIdx) {
      result.push(msg);
      continue;
    }
    const distanceFromEnd = totalMessages - 1 - i;
    if (distanceFromEnd <= t.verbatim) {
      result.push(msg);
    } else if (distanceFromEnd <= t.light) {
      const compressed = applyLiteCompression({ messages: [msg] });
      if (compressed?.body?.messages?.[0]?.content) {
        const newContent = typeof compressed.body.messages[0].content === "string" ? compressed.body.messages[0].content : extractTextContent(compressed.body.messages[0].content);
        const tagged = tagAged("light", text, newContent);
        saved += estimateTokens(text) - estimateTokens(tagged);
        result.push(setContent(msg, tagged));
      } else {
        result.push(msg);
      }
    } else if (distanceFromEnd <= t.moderate) {
      const compressed = cavemanCompress({ messages: [msg] });
      if (compressed?.body?.messages?.[0]?.content) {
        const newContent = typeof compressed.body.messages[0].content === "string" ? compressed.body.messages[0].content : extractTextContent(compressed.body.messages[0].content);
        const tagged = tagAged("moderate", text, newContent);
        saved += estimateTokens(text) - estimateTokens(tagged);
        result.push(setContent(msg, tagged));
      } else {
        result.push(msg);
      }
    } else {
      if (msg.role === "assistant") {
        const summary = sum.summarize([msg]);
        const tagged = tagAged("fullSummary", text, summary);
        saved += estimateTokens(text) - estimateTokens(tagged);
        result.push(setContent(msg, tagged));
      } else if (msg.role === "user") {
        const firstLine = text.split("\n")[0]?.slice(0, 120) ?? "";
        const tagged = tagAged("fullSummary", text, firstLine);
        saved += estimateTokens(text) - estimateTokens(tagged);
        result.push(setContent(msg, tagged));
      } else {
        result.push(msg);
      }
    }
  }
  return { messages: result, saved: Math.max(0, saved) };
}
export {
  applyAging
};
