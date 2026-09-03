const JSON_NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const NUMERIC_LIKE_RE = /^[+-]\.?\d|^\.\d|^0\d/;
const INLINE_ARRAY_RE = /\[[^\]]*\]\s*:/;
function needsQuote(s) {
  if (s === "") return true;
  if (s === "-" || s === "~" || s === "^" || s === "true" || s === "false") return true;
  if (JSON_NUMBER_RE.test(s)) return true;
  if (NUMERIC_LIKE_RE.test(s)) return true;
  if (s[0] === " " || s[s.length - 1] === " ") return true;
  if (s[0] === "#" || s[0] === "@" || s[0] === ".") return true;
  if (INLINE_ARRAY_RE.test(s)) return true;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34 || c === 92 || c < 32 || c === 10 || c === 13 || c === 124 || c === 44)
      return true;
    if (c >= 128 && c <= 159) return true;
    if (c > 127 && (c === 160 || c === 8232 || c === 8233 || c === 65279 || c === 5760 || c >= 8192 && c <= 8202 || c === 8239 || c === 8287 || c === 12288))
      return true;
  }
  return false;
}
function quoteString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 34:
        out += '\\"';
        break;
      case 92:
        out += "\\\\";
        break;
      case 8:
        out += "\\b";
        break;
      case 12:
        out += "\\f";
        break;
      case 10:
        out += "\\n";
        break;
      case 13:
        out += "\\r";
        break;
      case 9:
        out += "\\t";
        break;
      default:
        if (c < 32) {
          out += "\\u" + c.toString(16).padStart(4, "0");
        } else {
          out += s[i];
        }
    }
  }
  return out + '"';
}
function formatScalar(v, delimiter = 0) {
  if (v === null || v === void 0) return "-";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return formatNumber(v);
  const s = String(v);
  if (needsQuote(s) || delimiter && s.includes(String.fromCharCode(delimiter))) {
    return quoteString(s);
  }
  return s;
}
function formatNumber(f) {
  if (Object.is(f, -0)) return "-0";
  if (f === 0) return "0";
  const abs = Math.abs(f);
  if (abs >= 1e-6 && abs < 9007199254740992) {
    return toPreciseDecimal(f);
  }
  let s = f.toExponential();
  s = s.replace(/[eE]\+?0*(\d)/, "e+$1").replace(/[eE]-0*(\d)/, "e-$1");
  return s;
}
function toPreciseDecimal(f) {
  return String(f);
}
const BARE_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function isBareKey(s) {
  return BARE_KEY_RE.test(s);
}
function formatKey(s) {
  return isBareKey(s) ? s : quoteString(s);
}
function parseScalar(s, tabularContext) {
  if (s === "") return "";
  if (s[0] === '"') return parseQuotedString(s);
  if (s === "-") return null;
  if (s === "~") {
    if (!tabularContext) throw new Error("invalid_missing: ~ outside tabular row cell");
    return MISSING;
  }
  if (s === "^" || s.startsWith("^{") && s.endsWith("}")) {
    if (!tabularContext) throw new Error("invalid_attachment_marker: ^ outside tabular row cell");
    if (s === "^") return ATTACHMENT;
    return { __inlineSchema: s.slice(1) };
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (JSON_NUMBER_RE.test(s)) {
    const f = Number(s);
    if (!isNaN(f)) return f;
  }
  return s;
}
const MISSING = Symbol("missing");
const ATTACHMENT = Symbol("attachment");
function parseQuotedString(s) {
  if (s.length < 2 || s[0] !== '"') throw new Error("unterminated_quote");
  let out = "";
  let i = 1;
  while (i < s.length) {
    if (s[i] === '"') {
      if (i + 1 !== s.length) throw new Error("trailing_characters: after closing quote");
      return out;
    }
    if (s[i] === "\\") {
      if (i + 1 >= s.length) throw new Error("unterminated_quote");
      i++;
      switch (s[i]) {
        case '"':
          out += '"';
          break;
        case "\\":
          out += "\\";
          break;
        case "/":
          out += "/";
          break;
        case "b":
          out += "\b";
          break;
        case "f":
          out += "\f";
          break;
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "	";
          break;
        case "u": {
          if (i + 4 >= s.length) throw new Error("invalid_escape: incomplete unicode");
          const hex = s.slice(i + 1, i + 5);
          const code = parseInt(hex, 16);
          if (isNaN(code)) throw new Error(`invalid_escape: invalid unicode \\u${hex}`);
          if (code >= 55296 && code <= 56319) {
            if (i + 10 >= s.length || s[i + 5] !== "\\" || s[i + 6] !== "u") {
              throw new Error("invalid_surrogate: isolated high surrogate");
            }
            const hex2 = s.slice(i + 7, i + 11);
            const low = parseInt(hex2, 16);
            if (isNaN(low) || low < 56320 || low > 57343) {
              throw new Error("invalid_surrogate: invalid low surrogate");
            }
            out += String.fromCodePoint(65536 + (code - 55296) * 1024 + (low - 56320));
            i += 11;
            continue;
          }
          if (code >= 56320 && code <= 57343) {
            throw new Error("invalid_surrogate: isolated low surrogate");
          }
          out += String.fromCharCode(code);
          i += 5;
          continue;
        }
        default:
          throw new Error(`invalid_escape: unknown \\${s[i]}`);
      }
      i++;
      continue;
    }
    if (s.charCodeAt(i) < 32) {
      throw new Error(
        `invalid_escape: unescaped control U+${s.charCodeAt(i).toString(16).padStart(4, "0")}`
      );
    }
    out += s[i];
    i++;
  }
  throw new Error("unterminated_quote");
}
function splitRespectingQuotes(s, delim) {
  const parts = [];
  let current = "";
  let inQuote = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    if (escaped) {
      current += s[i];
      escaped = false;
      continue;
    }
    if (s[i] === "\\" && inQuote) {
      current += s[i];
      escaped = true;
      continue;
    }
    if (s[i] === '"') {
      inQuote = !inQuote;
      current += s[i];
      continue;
    }
    if (s[i] === delim && !inQuote) {
      parts.push(current);
      current = "";
      continue;
    }
    current += s[i];
  }
  parts.push(current);
  return parts;
}
function splitFieldDecl(s) {
  if (s.length < 2 || s[0] !== "{") throw new Error("invalid field declaration");
  const closeIdx = findClosingBrace(s);
  if (closeIdx < 0) throw new Error("invalid field declaration");
  const inner = s.slice(1, closeIdx);
  if (!inner) return [];
  const raw = splitRespectingQuotes(inner, ",");
  const fields = [];
  const seen = /* @__PURE__ */ new Set();
  for (const f of raw) {
    const trimmed = f.trim();
    let name;
    if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
      name = parseQuotedString(trimmed);
    } else {
      if (!isBareKey(trimmed)) throw new Error(`invalid field name: ${trimmed}`);
      name = trimmed;
    }
    if (seen.has(name)) throw new Error(`duplicate_field_name: ${name}`);
    seen.add(name);
    fields.push(name);
  }
  return fields;
}
function findClosingBrace(s) {
  let inQuote = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (s[i] === "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (s[i] === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (s[i] === "}" && !inQuote) return i;
  }
  return -1;
}
export {
  ATTACHMENT,
  MISSING,
  formatKey,
  formatNumber,
  formatScalar,
  isBareKey,
  needsQuote,
  parseQuotedString,
  parseScalar,
  quoteString,
  splitFieldDecl,
  splitRespectingQuotes
};
