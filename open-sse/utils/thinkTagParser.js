import { shouldParseTextualReasoningTags } from "./omni/responseSanitizerReasoning.js";
import { appendBoundedText, buildSyntheticChatChunk } from "./omni/streamHelpers.js";
const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";
const THINK_OPEN_PARTIALS = Array.from(
  { length: THINK_OPEN.length - 1 },
  (_, i) => THINK_OPEN.slice(0, i + 1)
);
function initThinkState(isPassthroughMode, provider, model) {
  return {
    enabled: isPassthroughMode && shouldParseTextualReasoningTags(provider, model),
    insideThink: false,
    buffer: "",
    active: false,
    model
  };
}
function containsOrMayEndWithThinkOpenTag(value) {
  return value.includes(THINK_OPEN) || THINK_OPEN_PARTIALS.some((suffix) => value.endsWith(suffix));
}
function hasThinkTags(text) {
  if (!text) return false;
  return text.includes(THINK_OPEN);
}
function extractThinkTags(text) {
  if (!text || !text.includes(THINK_OPEN)) {
    return { reasoning: null, content: text || "" };
  }
  let reasoning = "";
  let content = text;
  let iterations = 0;
  const maxIterations = 10;
  while (content.includes(THINK_OPEN) && iterations < maxIterations) {
    const openIdx = content.indexOf(THINK_OPEN);
    const closeIdx = content.indexOf(THINK_CLOSE, openIdx);
    if (closeIdx === -1) {
      reasoning += content.slice(openIdx + THINK_OPEN.length);
      content = content.slice(0, openIdx);
      break;
    }
    const thinkContent = content.slice(openIdx + THINK_OPEN.length, closeIdx);
    reasoning += (reasoning ? "\n" : "") + thinkContent;
    content = content.slice(0, openIdx) + content.slice(closeIdx + THINK_CLOSE.length);
    iterations++;
  }
  return {
    reasoning: reasoning.trim() || null,
    content: content.trim()
  };
}
function processStreamingThinkDelta(delta, ctx) {
  if (!ctx.buffer) ctx.buffer = "";
  ctx.buffer += delta;
  let reasoningDelta = "";
  let contentDelta = "";
  while (ctx.buffer.length > 0) {
    if (ctx.insideThink) {
      const closeIdx = ctx.buffer.indexOf(THINK_CLOSE);
      if (closeIdx === -1) {
        if (ctx.buffer.length > THINK_CLOSE.length) {
          const safe = ctx.buffer.slice(0, -(THINK_CLOSE.length - 1));
          reasoningDelta += safe;
          ctx.buffer = ctx.buffer.slice(-(THINK_CLOSE.length - 1));
        }
        break;
      }
      reasoningDelta += ctx.buffer.slice(0, closeIdx);
      ctx.buffer = ctx.buffer.slice(closeIdx + THINK_CLOSE.length);
      ctx.insideThink = false;
    } else {
      const openIdx = ctx.buffer.indexOf(THINK_OPEN);
      if (openIdx === -1) {
        if (ctx.buffer.length > THINK_OPEN.length) {
          const safe = ctx.buffer.slice(0, -(THINK_OPEN.length - 1));
          contentDelta += safe;
          ctx.buffer = ctx.buffer.slice(-(THINK_OPEN.length - 1));
        }
        break;
      }
      contentDelta += ctx.buffer.slice(0, openIdx);
      ctx.buffer = ctx.buffer.slice(openIdx + THINK_OPEN.length);
      ctx.insideThink = true;
    }
  }
  return {
    reasoningDelta: reasoningDelta || null,
    contentDelta: contentDelta || null
  };
}
function applyThinkTag(ctx, delta) {
  if (!ctx.enabled || typeof delta?.content !== "string") return false;
  if (!ctx.active && !containsOrMayEndWithThinkOpenTag(delta.content)) return false;
  ctx.active = true;
  const { reasoningDelta, contentDelta } = processStreamingThinkDelta(delta.content, ctx);
  delta.content = contentDelta || "";
  if (reasoningDelta) delta.reasoning_content = reasoningDelta;
  return true;
}
function flushThinkBuffer(ctx) {
  if (!ctx.buffer) return { reasoningDelta: null, contentDelta: null };
  const remaining = ctx.buffer;
  ctx.buffer = "";
  if (ctx.insideThink) {
    return { reasoningDelta: remaining || null, contentDelta: null };
  }
  return { reasoningDelta: null, contentDelta: remaining || null };
}
function flushThink(ctx, responsesId, accReasoning, accContent) {
  if (!ctx.enabled || !ctx.active) return null;
  const { reasoningDelta, contentDelta } = flushThinkBuffer(ctx);
  if (!reasoningDelta && !contentDelta) return null;
  const delta = {};
  if (reasoningDelta) delta.reasoning_content = reasoningDelta;
  if (contentDelta) delta.content = contentDelta;
  const syntheticChunk = buildSyntheticChatChunk(responsesId, ctx.model, delta);
  return {
    syntheticChunk,
    flushOutput: `data: ${JSON.stringify(syntheticChunk)}

`,
    reasoning: appendBoundedText(accReasoning, reasoningDelta || ""),
    content: appendBoundedText(accContent, contentDelta || ""),
    addedLength: (reasoningDelta?.length || 0) + (contentDelta?.length || 0)
  };
}
export {
  applyThinkTag,
  containsOrMayEndWithThinkOpenTag,
  extractThinkTags,
  flushThink,
  flushThinkBuffer,
  hasThinkTags,
  initThinkState,
  processStreamingThinkDelta
};
