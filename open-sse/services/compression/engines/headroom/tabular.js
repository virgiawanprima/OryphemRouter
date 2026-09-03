import { encodeGeneric, decodeGeneric } from "./gcf/index.js";
import { TOON_FENCE_OPEN, decodeToon } from "./toon.js";
const GCF_FENCE_OPEN = "```gcf-generic";
const GCF_FENCE_CLOSE = "```";
const TABULAR_FENCE_OPEN = "```omni-tabular";
const TABULAR_FENCE_CLOSE = "```";
const TABULAR_MARKER_RE = /```(?:gcf-generic|omni-tabular)\n([\s\S]*?)\n```/g;
function kindOf(val) {
  if (val === null) return "null";
  if (typeof val === "number") return "n";
  if (typeof val === "boolean") return "b";
  if (typeof val === "object") return "j";
  return "s";
}
function encodeGcfBlock(arr) {
  return encodeGeneric(arr);
}
function wrapGcf(blockContent) {
  return `${GCF_FENCE_OPEN}
${blockContent}
${GCF_FENCE_CLOSE}`;
}
function encodeTabular(arr) {
  return wrapGcf(encodeGcfBlock(arr));
}
function encodeTabularBlock(arr) {
  return encodeGcfBlock(arr);
}
function wrapTabular(blockContent) {
  return wrapGcf(blockContent);
}
function encodeCell(raw) {
  const needsQuoting = raw.includes(",") || raw.includes('"') || raw.includes("\n") || raw.includes("\r") || raw.startsWith(" ") || raw.endsWith(" ");
  if (!needsQuoting) return raw;
  return '"' + raw.replace(/"/g, '""') + '"';
}
function parseCsvRow(line) {
  const cells = [];
  let i = 0;
  const len = line.length;
  while (i < len) {
    if (line[i] === '"') {
      let cell = "";
      i++;
      while (i < len) {
        if (line[i] === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          cell += line[i++];
        }
      }
      cells.push(cell);
      if (i < len && line[i] === ",") {
        i++;
        if (i === len) cells.push("");
      }
    } else {
      const start = i;
      while (i < len && line[i] !== ",") i++;
      cells.push(line.slice(start, i));
      if (i < len) {
        i++;
        if (i === len) cells.push("");
      }
    }
  }
  return cells;
}
function encodeTabularBlockLegacy(arr) {
  if (arr.length === 0) return "";
  const keysSet = /* @__PURE__ */ new Set();
  for (const row of arr) {
    for (const k of Object.keys(row)) keysSet.add(k);
  }
  const keys = Array.from(keysSet);
  const n = arr.length;
  const kinds = keys.map((k) => kindOf(arr[0][k]));
  const kindsRow = "__kinds__," + kinds.join(",");
  const headerRow = keys.map(encodeCell).join(",");
  const dataRows = arr.map((row) => {
    return keys.map((k) => {
      const val = row[k];
      const kind = kindOf(val);
      if (kind === "null") return "null";
      if (kind === "n") return String(val);
      if (kind === "b") return String(val);
      return encodeCell(JSON.stringify(val));
    }).join(",");
  });
  return `[${n} rows]
${kindsRow}
${headerRow}
${dataRows.join("\n")}`;
}
function decodeTabularBlockLegacy(block) {
  const lines = block.split("\n");
  if (lines.length < 3) return [];
  const countLine = lines[0];
  const countMatch = countLine.match(/^\[(\d+) rows\]$/);
  if (!countMatch) return [];
  const n = parseInt(countMatch[1], 10);
  const kindsLine = lines[1];
  if (!kindsLine.startsWith("__kinds__,")) return [];
  const kindsRaw = parseCsvRow(kindsLine.slice("__kinds__,".length));
  const kinds = kindsRaw;
  const headerLine = lines[2];
  const keys = parseCsvRow(headerLine);
  const result = [];
  for (let i = 0; i < n; i++) {
    const rowLine = lines[3 + i];
    if (rowLine === void 0) break;
    const cells = parseCsvRow(rowLine);
    const obj = {};
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      const cell = cells[j] ?? "";
      const kind = kinds[j];
      if (kind === "null") {
        obj[key] = null;
      } else if (kind === "n") {
        obj[key] = Number(cell);
      } else if (kind === "b") {
        obj[key] = cell === "true";
      } else {
        try {
          obj[key] = JSON.parse(cell);
        } catch {
          obj[key] = cell;
        }
      }
    }
    result.push(obj);
  }
  return result;
}
function decodeTabular(text) {
  if (text.startsWith(TOON_FENCE_OPEN + "\n")) return decodeToon(text);
  if (text.startsWith(GCF_FENCE_OPEN + "\n") || text.startsWith("GCF ")) {
    let inner2 = text;
    const hadFence = inner2.startsWith(GCF_FENCE_OPEN + "\n");
    if (hadFence) {
      inner2 = inner2.slice(GCF_FENCE_OPEN.length + 1);
      if (inner2.endsWith("\n" + GCF_FENCE_CLOSE)) {
        inner2 = inner2.slice(0, inner2.length - GCF_FENCE_CLOSE.length - 1);
      } else if (inner2.endsWith(GCF_FENCE_CLOSE)) {
        inner2 = inner2.slice(0, inner2.length - GCF_FENCE_CLOSE.length);
      }
    }
    const result = decodeGeneric(inner2);
    if (Array.isArray(result)) return result;
    return [result];
  }
  let inner = text;
  if (inner.startsWith(TABULAR_FENCE_OPEN + "\n")) {
    inner = inner.slice(TABULAR_FENCE_OPEN.length + 1);
  }
  if (inner.endsWith("\n" + TABULAR_FENCE_CLOSE)) {
    inner = inner.slice(0, inner.length - TABULAR_FENCE_CLOSE.length - 1);
  } else if (inner.endsWith(TABULAR_FENCE_CLOSE)) {
    inner = inner.slice(0, inner.length - TABULAR_FENCE_CLOSE.length);
  }
  return decodeTabularBlockLegacy(inner);
}
export {
  GCF_FENCE_CLOSE,
  GCF_FENCE_OPEN,
  TABULAR_FENCE_CLOSE,
  TABULAR_FENCE_OPEN,
  TABULAR_MARKER_RE,
  decodeTabular,
  decodeTabularBlockLegacy,
  encodeGcfBlock,
  encodeTabular,
  encodeTabularBlock,
  encodeTabularBlockLegacy,
  kindOf,
  parseCsvRow,
  wrapGcf,
  wrapTabular
};
