import xxhashInit from "../utils/omni/xxhashWasm.js";
const CCH_SEED = 0x6e52736ac806831en;
const CCH_PATTERN = /\bcch=([0-9a-f]{5});/;
let xxhashPromise = null;
let xxhash64Fn = null;
async function ensureXxhash() {
  if (xxhash64Fn) return;
  if (!xxhashPromise) {
    xxhashPromise = (async () => {
      const hasher = await xxhashInit();
      xxhash64Fn = hasher.h64Raw;
    })();
  }
  return xxhashPromise;
}
async function computeCCH(bodyBytes) {
  await ensureXxhash();
  const hash = xxhash64Fn(bodyBytes, CCH_SEED);
  const masked = hash & 0xfffffn;
  return masked.toString(16).padStart(5, "0");
}
async function signRequestBody(bodyString) {
  if (!CCH_PATTERN.test(bodyString)) return bodyString;
  const encoder = new TextEncoder();
  const bodyBytes = encoder.encode(bodyString);
  const token = await computeCCH(bodyBytes);
  return bodyString.replace(CCH_PATTERN, `cch=${token};`);
}
export {
  CCH_PATTERN,
  computeCCH,
  signRequestBody
};
