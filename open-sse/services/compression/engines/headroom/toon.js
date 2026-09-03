import { encode as toonEncode, decode as toonDecode } from "../../../../utils/omni/toonShim.js";
const TOON_FENCE_OPEN = "```toon";
const TOON_FENCE_CLOSE = "```";
function encodeToonBlock(arr) {
  try {
    return toonEncode(arr);
  } catch {
    return null;
  }
}
function wrapToon(blockContent) {
  return `${TOON_FENCE_OPEN}
${blockContent}
${TOON_FENCE_CLOSE}`;
}
function decodeToon(text) {
  let inner = text;
  if (inner.startsWith(TOON_FENCE_OPEN + "\n")) {
    inner = inner.slice(TOON_FENCE_OPEN.length + 1);
    if (inner.endsWith("\n" + TOON_FENCE_CLOSE)) {
      inner = inner.slice(0, inner.length - TOON_FENCE_CLOSE.length - 1);
    } else if (inner.endsWith(TOON_FENCE_CLOSE)) {
      inner = inner.slice(0, inner.length - TOON_FENCE_CLOSE.length);
    }
  }
  try {
    const decoded = toonDecode(inner);
    if (Array.isArray(decoded)) return decoded;
    return [decoded];
  } catch {
    return [];
  }
}
export {
  TOON_FENCE_CLOSE,
  TOON_FENCE_OPEN,
  decodeToon,
  encodeToonBlock,
  wrapToon
};
