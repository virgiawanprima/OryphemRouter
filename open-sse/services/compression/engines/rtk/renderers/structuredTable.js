import { NO_RENDER } from "./types.js";
const MAX_TABLE_ROWS = 200;
const MAX_COLUMNS = 5;
const PRIORITY_KEYS = ["name", "id", "status", "type", "kind"];
function renderStructuredTable(text, _detection) {
  const parsed = tryParse(text.trim());
  if (!parsed) return NO_RENDER(text);
  if (!Array.isArray(parsed) || parsed.length < 2) return NO_RENDER(text);
  const items = parsed;
  if (!items.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
    return NO_RENDER(text);
  }
  const objects = items;
  const keyCount = {};
  for (const obj of objects) {
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || typeof v !== "object") {
        keyCount[k] = (keyCount[k] ?? 0) + 1;
      }
    }
  }
  if (Object.keys(keyCount).length === 0) return NO_RENDER(text);
  const threshold = Math.floor(objects.length / 2);
  const candidateKeys = Object.entries(keyCount).filter(([, count]) => count >= threshold).map(([k]) => k);
  const priorityChosen = PRIORITY_KEYS.filter((k) => candidateKeys.includes(k));
  const rest = candidateKeys.filter((k) => !PRIORITY_KEYS.includes(k)).sort((a, b) => (keyCount[b] ?? 0) - (keyCount[a] ?? 0));
  const columns = [...priorityChosen, ...rest].slice(0, MAX_COLUMNS);
  if (columns.length === 0) return NO_RENDER(text);
  const rows = objects.slice(0, MAX_TABLE_ROWS);
  const extra = objects.length > MAX_TABLE_ROWS ? objects.length - MAX_TABLE_ROWS : 0;
  const header = columns.join("	");
  const body = rows.map((obj) => columns.map((k) => String(obj[k] ?? "")).join("	")).join("\n");
  const out = extra > 0 ? `${header}
${body}
\u2026 (+${extra} more)` : `${header}
${body}`;
  return { text: out, changed: true, renderer: "structured-table" };
}
function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
export {
  renderStructuredTable
};
