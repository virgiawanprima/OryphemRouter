import { createHash } from "node:crypto";
const MASK = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n
];
const ROT = [
  0,
  1,
  62,
  28,
  27,
  36,
  44,
  6,
  55,
  20,
  3,
  10,
  43,
  25,
  39,
  41,
  45,
  15,
  21,
  8,
  18,
  2,
  61,
  56,
  14
];
function rotl64(x, n) {
  if (n === 0) return x;
  const bn = BigInt(n);
  return (x << bn | x >> 64n - bn) & MASK;
}
function keccakF1600(s) {
  const C = new Array(5);
  const D = new Array(5);
  const B = new Array(25);
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] ^= D[x];
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(s[x + 5 * y], ROT[x + 5 * y]);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        s[x + 5 * y] = B[x + 5 * y] ^ ~B[(x + 1) % 5 + 5 * y] & MASK & B[(x + 2) % 5 + 5 * y];
      }
    }
    s[0] ^= RC[round];
  }
}
const RATE_BYTES = 72;
function sha3_512Bytes(msg) {
  const s = new Array(25).fill(0n);
  const padLen = RATE_BYTES - msg.length % RATE_BYTES;
  const padded = new Uint8Array(msg.length + padLen);
  padded.set(msg);
  padded[msg.length] = 6;
  padded[padded.length - 1] |= 128;
  for (let off = 0; off < padded.length; off += RATE_BYTES) {
    for (let i = 0; i < RATE_BYTES / 8; i++) {
      let lane = 0n;
      for (let b = 0; b < 8; b++) lane |= BigInt(padded[off + i * 8 + b]) << BigInt(8 * b);
      s[i] ^= lane;
    }
    keccakF1600(s);
  }
  const out = new Uint8Array(64);
  for (let i = 0; i < 8; i++) {
    const lane = s[i];
    for (let b = 0; b < 8; b++) out[i * 8 + b] = Number(lane >> BigInt(8 * b) & 0xffn);
  }
  return out;
}
function toBytes(input) {
  return typeof input === "string" ? new Uint8Array(Buffer.from(input, "utf8")) : input;
}
function sha3_512HexJs(input) {
  return Buffer.from(sha3_512Bytes(toBytes(input))).toString("hex");
}
let nativeHasher;
function detectNative() {
  try {
    createHash("sha3-512").update(Buffer.alloc(0)).digest("hex");
    return (data) => createHash("sha3-512").update(data).digest("hex");
  } catch {
    return null;
  }
}
function sha3_512Hex(input) {
  const data = toBytes(input);
  if (nativeHasher === void 0) nativeHasher = detectNative();
  if (nativeHasher) {
    try {
      return nativeHasher(data);
    } catch {
      nativeHasher = null;
    }
  }
  return sha3_512HexJs(data);
}
function __setSha3NativeForTesting(state) {
  nativeHasher = state;
}
export {
  __setSha3NativeForTesting,
  sha3_512Hex,
  sha3_512HexJs
};
