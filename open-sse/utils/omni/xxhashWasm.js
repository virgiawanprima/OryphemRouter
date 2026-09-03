// Replacement for the `xxhash-wasm` npm package (not installed in
// OryphemRouter). Pure-JS xxHash64 used by claudeCodeCCH. Tries the real
// package first when it becomes available, else falls back to this impl.
const P1 = 0x9e3779b185ebca87n;
const P2 = 0xc2b2ae3d27d4eb4fn;
const P3 = 0x165667b19e3779f9n;
const P4 = 0x85ebca77c2b2ae63n;
const P5 = 0x27d4eb2f165667c5n;
const MASK64 = (1n << 64n) - 1n;
function rotl64(x, r) { return ((x << BigInt(r)) | (x >> BigInt(64 - r))) & MASK64; }
function readU32(bytes, i) {
  return (BigInt(bytes[i]) | (BigInt(bytes[i + 1]) << 8n) | (BigInt(bytes[i + 2]) << 16n) | (BigInt(bytes[i + 3]) << 24n)) & 0xffffffffn;
}
function readU64(bytes, i) {
  return (readU32(bytes, i) | (readU32(bytes, i + 4) << 32n)) & MASK64;
}
function round(acc, input) {
  acc = (acc + input * P2) & MASK64;
  acc = rotl64(acc, 31);
  acc = (acc * P1) & MASK64;
  return acc;
}
function mergeRound(acc, val) {
  val = round(0n, val);
  acc = (acc ^ val) & MASK64;
  acc = (acc * P1 + P4) & MASK64;
  return acc;
}
function xxhash64Raw(bytes, seed = 0n) {
  let seedBig = typeof seed === "bigint" ? seed : BigInt(seed >>> 0);
  const len = bytes.length;
  let i = 0;
  let h;
  if (len >= 32) {
    let v1 = (seedBig + P1 + P2) & MASK64;
    let v2 = (seedBig + P2) & MASK64;
    let v3 = seedBig & MASK64;
    let v4 = (seedBig - P1) & MASK64;
    const limit = len - 32;
    while (i <= limit) {
      v1 = round(v1, readU64(bytes, i)); i += 8;
      v2 = round(v2, readU64(bytes, i)); i += 8;
      v3 = round(v3, readU64(bytes, i)); i += 8;
      v4 = round(v4, readU64(bytes, i)); i += 8;
    }
    h = (rotl64(v1, 1) + rotl64(v2, 7) + rotl64(v3, 12) + rotl64(v4, 18)) & MASK64;
    h = mergeRound(h, v1);
    h = mergeRound(h, v2);
    h = mergeRound(h, v3);
    h = mergeRound(h, v4);
  } else {
    h = (seedBig + P5) & MASK64;
  }
  h = (h + BigInt(len)) & MASK64;
  while (i + 8 <= len) {
    const k1 = round(0n, readU64(bytes, i)); i += 8;
    h = (h ^ k1) & MASK64;
    h = (rotl64(h, 27) * P1 + P4) & MASK64;
  }
  if (i + 4 <= len) {
    h = (h ^ (readU32(bytes, i) * P1)) & MASK64;
    h = (rotl64(h, 23) * P2 + P3) & MASK64;
    i += 4;
  }
  while (i < len) {
    h = (h ^ (BigInt(bytes[i]) * P5)) & MASK64;
    h = (rotl64(h, 11) * P1) & MASK64;
    i += 1;
  }
  h = (h ^ (h >> 33n)) & MASK64;
  h = (h * P2) & MASK64;
  h = (h ^ (h >> 29n)) & MASK64;
  h = (h * P3) & MASK64;
  h = (h ^ (h >> 32n)) & MASK64;
  return h;
}
export default async function xxhashInit() {
  try {
    const real = await import("xxhash-wasm");
    const mod = real.default || real;
    const h = typeof mod === "function" ? await mod() : mod;
    if (h && typeof h.h64Raw === "function") return { h64Raw: h.h64Raw };
  } catch { /* not installed — fall back */ }
  return { h64Raw: xxhash64Raw };
}
