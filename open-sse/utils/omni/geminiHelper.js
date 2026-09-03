// ADAPTED STUB — ported from OmniRoute open-sse/translator/helpers/geminiHelper.ts
// Only `extractTextContent` is needed (by flattenToolHistory.js).

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** Extract concatenated text parts from a Gemini-style content value. */
export function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => toRecord(item))
      .filter((c) => c && c.type === "text")
      .map((c) => (typeof c.text === "string" ? c.text : ""))
      .join("");
  }
  return "";
}
