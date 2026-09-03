import { DEFAULT_AGGRESSIVE_CONFIG } from "./types.js";
import {
  compressToolResult,
  compressAnthropicToolResultBlock,
  isAnthropicToolResultBlock
} from "./toolResultCompressor.js";
import { applyAging } from "./progressiveAging.js";
import { RuleBasedSummarizer } from "./summarizer.js";
import { cavemanCompress } from "./caveman.js";
import { applyLiteCompression } from "./lite.js";
import { extractTextContent, replaceTextContent } from "./messageContent.js";
const COMPRESSED_MARKER_RE = /^\[COMPRESSED:/;
function setContent(msg, newContent) {
  return replaceTextContent(msg, newContent);
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function compressAggressive(messages, config, stats) {
  const cfg = {
    ...DEFAULT_AGGRESSIVE_CONFIG,
    ...config,
    thresholds: { ...DEFAULT_AGGRESSIVE_CONFIG.thresholds, ...config?.thresholds ?? {} },
    toolStrategies: {
      ...DEFAULT_AGGRESSIVE_CONFIG.toolStrategies,
      ...config?.toolStrategies ?? {}
    }
  };
  const summarizer = new RuleBasedSummarizer();
  const resultStats = stats ?? {
    originalTokens: 0,
    compressedTokens: 0,
    savingsPercent: 0,
    techniquesUsed: [],
    mode: "aggressive",
    timestamp: Date.now()
  };
  const originalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(extractTextContent(m.content)),
    0
  );
  resultStats.originalTokens = originalTokens;
  let currentMessages = [...messages];
  let summarizerSavings = 0;
  let toolResultSavings = 0;
  let agingSavings = 0;
  const lastUserIdx = currentMessages.findLastIndex((m) => m.role === "user");
  try {
    const afterToolResult = currentMessages.map((msg) => {
      if (cfg.preserveSystemPrompt !== false && msg.role === "system") return msg;
      if (msg.role === "tool" || msg.role === "function") {
        const text = extractTextContent(msg.content);
        if (!text || COMPRESSED_MARKER_RE.test(text)) return msg;
        const result = compressToolResult(text, cfg.toolStrategies);
        if (result.strategy === "none" || result.saved <= 0) return msg;
        toolResultSavings += result.saved;
        return setContent(msg, result.compressed);
      }
      if (!Array.isArray(msg.content)) return msg;
      if (!msg.content.some(isAnthropicToolResultBlock)) return msg;
      let blockSavings = 0;
      const nextContent = msg.content.map((part) => {
        if (!isAnthropicToolResultBlock(part)) return part;
        const { block, saved } = compressAnthropicToolResultBlock(part, cfg.toolStrategies);
        blockSavings += saved;
        return block;
      });
      if (blockSavings <= 0) return msg;
      toolResultSavings += blockSavings;
      return { ...msg, content: nextContent };
    });
    currentMessages = afterToolResult;
  } catch (err) {
  }
  try {
    const agingResult = applyAging(
      currentMessages,
      cfg.thresholds,
      summarizer,
      cfg.preserveSystemPrompt !== false,
      lastUserIdx
    );
    agingSavings = agingResult.saved;
    currentMessages = agingResult.messages;
  } catch (err) {
  }
  if (cfg.summarizerEnabled) {
    try {
      currentMessages = currentMessages.map((msg, idx) => {
        if (cfg.preserveSystemPrompt !== false && msg.role === "system") return msg;
        if (idx === lastUserIdx) return msg;
        const text = extractTextContent(msg.content);
        if (!text || COMPRESSED_MARKER_RE.test(text)) return msg;
        if (text.length <= cfg.maxTokensPerMessage * 4) return msg;
        const summary = summarizer.summarize([msg], {
          maxLen: cfg.maxTokensPerMessage,
          preserveCode: true
        });
        if (summary && summary.length < text.length) {
          summarizerSavings += estimateTokens(text) - estimateTokens(summary);
          const finalSummary = COMPRESSED_MARKER_RE.test(summary) ? summary : `[COMPRESSED:summary] ${summary}`;
          return setContent(msg, finalSummary);
        }
        return msg;
      });
    } catch (err) {
    }
  }
  const compressedTokens = currentMessages.reduce(
    (sum, m) => sum + estimateTokens(extractTextContent(m.content)),
    0
  );
  resultStats.compressedTokens = compressedTokens;
  resultStats.savingsPercent = originalTokens > 0 ? (originalTokens - compressedTokens) / originalTokens * 100 : 0;
  if (resultStats.savingsPercent < cfg.minSavingsThreshold * 100) {
    try {
      const cavemanResult = cavemanCompress(
        {
          messages: currentMessages
        },
        { enabled: true }
      );
      if (cavemanResult?.compressed && cavemanResult.body?.messages) {
        const rawMsgs = cavemanResult.body.messages;
        const candidateMsgs = rawMsgs.map(
          (msg, idx) => idx === lastUserIdx ? currentMessages[idx] : msg
        );
        const candidateTokens = candidateMsgs.reduce(
          (sum, m) => sum + estimateTokens(extractTextContent(m.content)),
          0
        );
        const candidateSavings = originalTokens > 0 ? (originalTokens - candidateTokens) / originalTokens * 100 : 0;
        if (candidateSavings > resultStats.savingsPercent) {
          currentMessages = candidateMsgs;
          resultStats.compressedTokens = candidateTokens;
          resultStats.savingsPercent = candidateSavings;
          resultStats.techniquesUsed.push("caveman-fallback");
        }
      }
    } catch (err) {
    }
    try {
      const liteResult = applyLiteCompression(
        { messages: currentMessages },
        { preserveSystemPrompt: cfg.preserveSystemPrompt !== false }
      );
      if (liteResult?.compressed && liteResult.body?.messages) {
        const rawMsgs = liteResult.body.messages;
        const candidateMsgs = rawMsgs.map(
          (msg, idx) => idx === lastUserIdx ? currentMessages[idx] : msg
        );
        const candidateTokens = candidateMsgs.reduce(
          (sum, m) => sum + estimateTokens(extractTextContent(m.content)),
          0
        );
        const candidateSavings = originalTokens > 0 ? (originalTokens - candidateTokens) / originalTokens * 100 : 0;
        if (candidateSavings > resultStats.savingsPercent) {
          currentMessages = candidateMsgs;
          resultStats.compressedTokens = candidateTokens;
          resultStats.savingsPercent = candidateSavings;
          resultStats.techniquesUsed.push("lite-fallback");
        }
      }
    } catch (err) {
    }
  }
  resultStats.techniquesUsed.push(
    ...toolResultSavings > 0 ? ["toolResult"] : [],
    ...agingSavings > 0 ? ["aging"] : [],
    ...summarizerSavings > 0 ? ["summarizer"] : []
  );
  resultStats.aggressive = {
    summarizerSavings,
    toolResultSavings,
    agingSavings
  };
  return { messages: currentMessages, stats: resultStats };
}
export {
  DEFAULT_AGGRESSIVE_CONFIG,
  compressAggressive
};
