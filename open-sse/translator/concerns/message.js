import { OPENAI_BLOCK } from "../schema/index.js";

// Collapse an OpenAI content-part array to a plain string when it holds only
// text parts (joined with "\n") — string-form payloads are accepted by every
// OpenAI-compatible provider. Arrays containing non-text blocks (image etc.)
// are returned as-is to preserve the multimodal content.
export function collapseTextParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return parts;
  if (parts.every((p) => p && p.type === OPENAI_BLOCK.TEXT)) {
    return parts.map((p) => p.text || "").join("\n");
  }
  return parts.length === 1 && parts[0].type === OPENAI_BLOCK.TEXT ? parts[0].text : parts;
}
