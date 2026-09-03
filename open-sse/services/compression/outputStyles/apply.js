import { SHARED_BOUNDARIES, shouldBypassCavemanOutputMode } from "../outputMode.js";
import { OUTPUT_STYLE_IDS, outputStyleMeta } from "./catalog.js";
const OUTPUT_STYLE_MARKER = "[OmniRoute Output Styles]";
function resolveStyles(selection, language) {
  const byId = new Map(selection.map((entry) => [entry.id, entry]));
  const resolved = [];
  for (const id of OUTPUT_STYLE_IDS) {
    const entry = byId.get(id);
    if (!entry) continue;
    const meta = outputStyleMeta(id);
    if (!meta) continue;
    if (meta.locale && meta.locale !== language) continue;
    resolved.push({ id, level: entry.level });
  }
  return resolved;
}
function buildStyleInstructions(resolved, language) {
  const parts = [];
  for (const { id, level } of resolved) {
    const meta = outputStyleMeta(id);
    const localized = meta.i18n?.[language];
    const levels = localized ?? meta.levels;
    parts.push(levels[level].replace(SHARED_BOUNDARIES, "").trim());
  }
  return parts.join("\n");
}
function applyOutputStyles(body, selection, language = "en") {
  const resolved = resolveStyles(selection ?? [], language);
  if (resolved.length === 0) {
    return { body, applied: false, skippedReason: "no_styles" };
  }
  const combined = `${buildStyleInstructions(resolved, language)} ${SHARED_BOUNDARIES}`;
  const instruction = `${OUTPUT_STYLE_MARKER}
${combined}`;
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    if (typeof body.instructions === "string") {
      if (body.instructions.includes(OUTPUT_STYLE_MARKER)) {
        return { body, applied: false, skippedReason: "already_applied" };
      }
      return {
        body: { ...body, instructions: `${body.instructions.trim()}

${instruction}` },
        applied: true,
        appliedStyles: resolved
      };
    }
    if (typeof body.input === "string" || Array.isArray(body.input)) {
      return { body: { ...body, instructions: instruction }, applied: true, appliedStyles: resolved };
    }
    return { body, applied: false, skippedReason: "no_messages" };
  }
  const alreadyApplied = messages.some(
    (message) => message.role === "system" && typeof message.content === "string" && message.content.includes(OUTPUT_STYLE_MARKER)
  );
  if (alreadyApplied) return { body, applied: false, skippedReason: "already_applied" };
  const bypass = shouldBypassCavemanOutputMode(messages);
  if (bypass) return { body, applied: false, skippedReason: bypass };
  const nextMessages = [...messages];
  const first = nextMessages[0];
  if (first?.role === "system" && typeof first.content === "string") {
    nextMessages[0] = { ...first, content: `${first.content.trim()}

${instruction}` };
  } else {
    nextMessages.unshift({ role: "system", content: instruction });
  }
  return { body: { ...body, messages: nextMessages }, applied: true, appliedStyles: resolved };
}
export {
  OUTPUT_STYLE_MARKER,
  applyOutputStyles
};
