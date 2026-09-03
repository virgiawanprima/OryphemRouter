import { NO_RENDER } from "./types.js";
function renderTestGreen(text, _detection) {
  const stripped = text.replace(/\[[0-9;]*m/g, "");
  if (/\bFAIL\b/.test(stripped)) return NO_RENDER(text);
  if (/✖/.test(stripped)) return NO_RENDER(text);
  if (/Error/.test(stripped)) return NO_RENDER(text);
  if (/Traceback/.test(stripped)) return NO_RENDER(text);
  if (/AssertionError/.test(stripped)) return NO_RENDER(text);
  const failedMatch = stripped.match(/(\d+)\s+failed/i) ?? stripped.match(/failed[:\s]+(\d+)/i);
  if (failedMatch && parseInt(failedMatch[1], 10) > 0) return NO_RENDER(text);
  const summary = extractSummaryLine(stripped);
  if (!summary) return NO_RENDER(text);
  return { text: summary, changed: true, renderer: "test-green" };
}
function extractSummaryLine(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    if (/={3,}\s+\d+\s+passed/.test(line)) return line.trim();
  }
  for (const line of lines) {
    if (/Tests:\s+\d+\s+passed/.test(line)) return line.trim();
  }
  for (const line of lines) {
    if (/\d+\s+tests?\s+passed/i.test(line)) return line.trim();
  }
  if (text.trim() === "" || text.trim().startsWith("\n")) {
    return "ESLint: 0 problems found";
  }
  return null;
}
export {
  renderTestGreen
};
