const BRIDGE_COMPACTION_PREFIX = "ocx1:";
const COMPACT_PROMPT = `You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work.`;
const SUMMARY_PREFIX = "Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis:";
const OPAQUE_COMPACTION_NOTE = "[earlier conversation was compacted; the summary is stored in a format this model cannot read]";
function isReadableCompactionSummaryText(value) {
  return typeof value === "string" && value.startsWith(`${SUMMARY_PREFIX}

`);
}
function encodeCompactionSummary(summary) {
  return BRIDGE_COMPACTION_PREFIX + Buffer.from(summary, "utf-8").toString("base64");
}
function decodeCompactionSummary(encryptedContent) {
  if (!encryptedContent.startsWith(BRIDGE_COMPACTION_PREFIX)) return null;
  try {
    return Buffer.from(encryptedContent.slice(BRIDGE_COMPACTION_PREFIX.length), "base64").toString(
      "utf-8"
    );
  } catch {
    return null;
  }
}
function compactionItemToText(encryptedContent) {
  const decoded = typeof encryptedContent === "string" ? decodeCompactionSummary(encryptedContent) : null;
  return decoded ? `${SUMMARY_PREFIX}

${decoded}` : OPAQUE_COMPACTION_NOTE;
}
const COMPACT_V1_RETAINED_CHAR_BUDGET = 2e4 * 4;
function extractCompactUserMessages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item;
    if (rec.type !== void 0 && rec.type !== "message") continue;
    if (rec.role !== "user") continue;
    let text = "";
    if (typeof rec.content === "string") text = rec.content;
    else if (Array.isArray(rec.content)) {
      text = rec.content.map((b) => {
        if (!b || typeof b !== "object") return "";
        const block = b;
        return (block.type === "input_text" || block.type === "text") && typeof block.text === "string" ? block.text : "";
      }).join("");
    }
    if (text.trim().length > 0) out.push(text);
  }
  return out;
}
function compactUserMessageItem(text) {
  return { type: "message", role: "user", content: [{ type: "input_text", text }] };
}
function buildCompactV1Output(userMessages, summary) {
  const selected = [];
  let remaining = COMPACT_V1_RETAINED_CHAR_BUDGET;
  for (let i = userMessages.length - 1; i >= 0 && remaining > 0; i--) {
    const msg = userMessages[i];
    if (msg.length <= remaining) {
      selected.push(msg);
      remaining -= msg.length;
    } else {
      selected.push(msg.slice(msg.length - remaining));
      break;
    }
  }
  selected.reverse();
  const summaryText = summary.trim().length > 0 ? `${SUMMARY_PREFIX}
${summary}` : "(no summary available)";
  return [...selected.map(compactUserMessageItem), compactUserMessageItem(summaryText)];
}
export {
  BRIDGE_COMPACTION_PREFIX,
  COMPACT_PROMPT,
  OPAQUE_COMPACTION_NOTE,
  SUMMARY_PREFIX,
  buildCompactV1Output,
  compactionItemToText,
  decodeCompactionSummary,
  encodeCompactionSummary,
  extractCompactUserMessages,
  isReadableCompactionSummaryText
};
