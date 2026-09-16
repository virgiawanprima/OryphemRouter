// Strip multimodal content blocks a model cannot read, BEFORE translation.
// Driven by getCapabilitiesForModel: vision/audioInput/pdf. Replaces removed
// media with a short text placeholder so messages never become empty.
import { FORMATS } from "../formats.js";

// Placeholder text inserted where a media block was removed.
// Current turn: explain the active model can't read what the user just sent.
const PLACEHOLDER_CURRENT = {
  vision: "[image omitted: model has no vision support]",
  audioInput: "[audio omitted: model has no audio support]",
  pdf: "[file omitted: model has no document support]",
};
// Earlier turns: neutral (a combo may route to a different model each turn).
const PLACEHOLDER_PREV = {
  vision: "[Previous image omitted from context.]",
  audioInput: "[Previous audio omitted from context.]",
  pdf: "[Previous file omitted from context.]",
};
const ph = (cap, isLast) => (isLast ? PLACEHOLDER_CURRENT : PLACEHOLDER_PREV)[cap];

// Map gemini inlineData/fileData mime prefix -> capability it requires.
function capForMime(mime) {
  if (typeof mime !== "string") return null;
  if (mime.startsWith("image/")) return "vision";
  if (mime.startsWith("audio/")) return "audioInput";
  if (mime === "application/pdf") return "pdf";
  return null;
}

// OpenAI chat content block -> required capability (null = plain text/other, keep).
function capForOpenAIBlock(block) {
  const t = block?.type;
  if (t === "image_url" || t === "image") return "vision";
  if (t === "input_audio" || t === "audio_url") return "audioInput";
  if (t === "file") return "pdf";
  return null;
}

// Claude content block -> required capability.
function capForClaudeBlock(block) {
  const t = block?.type;
  if (t === "image") return "vision";
  if (t === "document") return "pdf";
  return null;
}

// Filter an array of content blocks; drop unsupported, inject one placeholder per kind.
// isLast = block belongs to the current user turn (picks the explanatory placeholder).
function filterBlocks(blocks, capOf, caps, removed, isLast) {
  const out = [];
  for (const block of blocks) {
    const cap = capOf(block);
    if (cap && caps[cap] === false) { removed.add(cap); continue; }
    out.push(block);
  }
  for (const cap of removed) out.push({ type: "text", text: ph(cap, isLast) });
  return out;
}

// OpenAI / OpenAI-compatible chat messages[].content[].
// Returns the set of capabilities actually removed (empty = nothing dropped).
function stripOpenAI(body, caps) {
  const removedAll = new Set();
  if (!Array.isArray(body.messages)) return removedAll;
  const last = body.messages.length - 1;
  body.messages.forEach((msg, i) => {
    if (caps.vision === false) {
      if (Array.isArray(msg.images) && msg.images.length > 0) {
        delete msg.images;
        removedAll.add("vision");
      }
      if (Array.isArray(msg.experimental_attachments)) {
        const kept = msg.experimental_attachments.filter(
          (a) => !(a?.contentType?.startsWith("image/") || (typeof a?.url === "string" && a.url.startsWith("data:image/")))
        );
        if (kept.length !== msg.experimental_attachments.length) removedAll.add("vision");
        msg.experimental_attachments = kept;
      }
      if (Array.isArray(msg.attachments)) {
        const kept = msg.attachments.filter(
          (a) => !(a?.contentType?.startsWith("image/") || (typeof a?.url === "string" && a.url.startsWith("data:image/")))
        );
        if (kept.length !== msg.attachments.length) removedAll.add("vision");
        msg.attachments = kept;
      }
    }
    if (!Array.isArray(msg.content)) return;
    const removed = new Set();
    msg.content = filterBlocks(msg.content, capForOpenAIBlock, caps, removed, i === last);
    for (const cap of removed) removedAll.add(cap);
  });
  return removedAll;
}

// Claude messages[].content[]. Returns the set of capabilities actually removed.
function stripClaude(body, caps) {
  const removedAll = new Set();
  if (!Array.isArray(body.messages)) return removedAll;
  const last = body.messages.length - 1;
  body.messages.forEach((msg, i) => {
    if (!Array.isArray(msg.content)) return;
    const removed = new Set();
    msg.content = filterBlocks(msg.content, capForClaudeBlock, caps, removed, i === last);
    for (const cap of removed) removedAll.add(cap);
  });
  return removedAll;
}

// OpenAI Responses input[].content[] (input_image / input_file).
function stripResponses(body, caps) {
  const removedAll = new Set();
  if (!Array.isArray(body.input)) return removedAll;
  const last = body.input.length - 1;
  body.input.forEach((item, i) => {
    if (!Array.isArray(item.content)) return;
    const removed = new Set();
    item.content = item.content.filter((b) => {
      const cap = b?.type === "input_image" ? "vision" : b?.type === "input_file" ? "pdf" : null;
      if (cap && caps[cap] === false) { removed.add(cap); return false; }
      return true;
    });
    for (const cap of removed) item.content.push({ type: "input_text", text: ph(cap, i === last) });
    for (const cap of removed) removedAll.add(cap);
  });
  return removedAll;
}

// Gemini / gemini-cli contents[].parts[] (inlineData / fileData by mime).
function stripGeminiParts(contents, caps) {
  const removedAll = new Set();
  if (!Array.isArray(contents)) return removedAll;
  const last = contents.length - 1;
  contents.forEach((c, i) => {
    if (!Array.isArray(c.parts)) return;
    const removed = new Set();
    c.parts = c.parts.filter((p) => {
      const mime = p?.inlineData?.mimeType || p?.fileData?.mimeType;
      const cap = capForMime(mime);
      if (cap && caps[cap] === false) { removed.add(cap); return false; }
      return true;
    });
    for (const cap of removed) c.parts.push({ text: ph(cap, i === last) });
    for (const cap of removed) removedAll.add(cap);
  });
  return removedAll;
}

/**
 * Remove media blocks the model can't read, in-place on the source-format body.
 *
 * Reporting what was ACTUALLY dropped (rather than "a modality was disabled") is
 * deliberate: callers must be able to tell a request that lost user content from
 * one that merely targeted a text-only model, so the drop is never silent.
 *
 * @param {object} body - request body (source format)
 * @param {string} sourceFormat - one of FORMATS
 * @param {object} caps - capabilities from getCapabilitiesForModel
 * @returns {string[]} capability names actually removed ([] = nothing was dropped)
 */
export function stripUnsupportedModalities(body, sourceFormat, caps) {
  if (!body || !caps) return [];
  // Fast exit: model supports everything we'd strip.
  if (caps.vision !== false && caps.audioInput !== false && caps.pdf !== false) return [];

  let removed;
  switch (sourceFormat) {
    case FORMATS.OPENAI:
    case FORMATS.OLLAMA:
    case FORMATS.KIRO:
    case FORMATS.CURSOR:
    case FORMATS.COMMANDCODE:
      removed = stripOpenAI(body, caps);
      break;
    case FORMATS.CLAUDE:
      removed = stripClaude(body, caps);
      break;
    case FORMATS.OPENAI_RESPONSES:
    case FORMATS.OPENAI_RESPONSE:
    case FORMATS.CODEX:
      removed = stripResponses(body, caps);
      break;
    case FORMATS.GEMINI:
    case FORMATS.GEMINI_CLI:
    case FORMATS.VERTEX:
      removed = stripGeminiParts(body.contents, caps);
      break;
    case FORMATS.ANTIGRAVITY:
      removed = stripGeminiParts(body?.request?.contents, caps);
      break;
    default:
      removed = stripOpenAI(body, caps);
  }
  return [...removed];
}
