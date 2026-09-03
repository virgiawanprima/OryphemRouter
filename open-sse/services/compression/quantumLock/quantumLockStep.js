import { detectVolatileSpans } from "./quantumLock.js";
import {
  placeholderFor,
  TAIL_DELIM
} from "./quantumPatterns.js";
const emptyStats = () => ({ fragments: 0, categories: {} });
function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function systemTextOf(msg) {
  return typeof msg.content === "string" ? msg.content : "";
}
function applyQuantumLock(body, cfg, _ctx) {
  const messages = body.messages;
  if (!Array.isArray(messages)) return { body, stats: emptyStats() };
  const idx = messages.findIndex((m) => isRecord(m) && m.role === "system");
  if (idx === -1) return { body, stats: emptyStats() };
  const sys = messages[idx];
  const text = systemTextOf(sys);
  if (!text) return { body, stats: emptyStats() };
  if (text.includes(TAIL_DELIM)) return { body, stats: emptyStats() };
  const spans = detectVolatileSpans(text, cfg);
  if (spans.length === 0) return { body, stats: emptyStats() };
  let out = "";
  let cursor = 0;
  const values = [];
  const categories = {};
  spans.forEach((span, i) => {
    out += text.slice(cursor, span.start) + placeholderFor(i);
    values.push(text.slice(span.start, span.end));
    categories[span.category] = (categories[span.category] ?? 0) + 1;
    cursor = span.end;
  });
  out += text.slice(cursor);
  const tail = `

${TAIL_DELIM}
${values.map((v, i) => `${placeholderFor(i)}=${v}`).join("\n")}`;
  const newMessages = messages.slice();
  newMessages[idx] = { ...sys, content: out + tail };
  return {
    body: { ...body, messages: newMessages },
    stats: { fragments: values.length, categories }
  };
}
export {
  applyQuantumLock
};
