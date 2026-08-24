import crypto from "crypto";

const HARDCODED_FALLBACK = "endpoint-proxy-api-key-secret";
const API_KEY_SECRET = process.env.API_KEY_SECRET || HARDCODED_FALLBACK;

// Warn at module load if the hardcoded fallback is used (keys are forgeable).
if (API_KEY_SECRET === HARDCODED_FALLBACK && !process.env.API_KEY_SECRET) {
  console.warn(
    "[APIKey] WARNING: API_KEY_SECRET is unset — using hardcoded fallback. " +
    "API keys are forgeable. Set API_KEY_SECRET to a strong random secret " +
    "(e.g. `openssl rand -hex 32`)."
  );
}

// HMAC output length: 16 hex chars (64-bit) — increased from legacy 8 (32-bit)
// to reduce brute-force risk while keeping keys reasonably short.
const CRC_HEX_LEN = 16;

/**
 * Generate 8-char cryptographically-random keyId (≈41 bits of entropy vs the
 * old Math.random 6-char ≈31 bits). Uses rejection sampling to avoid modulo bias.
 */
function generateKeyId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const max = 256 - (256 % chars.length); // largest multiple of 36 ≤ 256 (252)
  const out = [];
  while (out.length < 8) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < max) out.push(chars[byte % chars.length]);
  }
  return out.join("");
}

/**
 * Generate CRC (16-char HMAC-SHA256)
 * Increased from legacy 8-char to 16-char for stronger security.
 */
function generateCrc(machineId, keyId) {
  return crypto
    .createHmac("sha256", API_KEY_SECRET)
    .update(machineId + keyId)
    .digest("hex")
    .slice(0, CRC_HEX_LEN);
}

/**
 * Generate API key with machineId embedded
 * Format: sk-{machineId}-{keyId}-{crc16}
 * Legacy format (accept-only): sk-{random8} (no crc)
 * @param {string} machineId - 16-char machine ID
 * @returns {{ key: string, keyId: string }}
 */
export function generateApiKeyWithMachine(machineId) {
  const keyId = generateKeyId();
  const crc = generateCrc(machineId, keyId);
  const key = `sk-${machineId}-${keyId}-${crc}`;
  return { key, keyId };
}

/**
 * Parse API key and extract machineId + keyId
 * Supports both formats:
 * - New: sk-{machineId}-{keyId}-{crc16}
 * - Legacy: sk-{machineId}-{keyId}-{crc8} (accept only — new keys use crc16)
 * - Old: sk-{random8}
 * @param {string} apiKey
 * @returns {{ machineId: string, keyId: string, isNewFormat: boolean } | null}
 */
export function parseApiKey(apiKey) {
  if (!apiKey || !apiKey.startsWith("sk-")) return null;

  const parts = apiKey.split("-");
  
  // New format: sk-{machineId}-{keyId}-{crc} = 4 parts
  if (parts.length === 4) {
    const [, machineId, keyId, crc] = parts;
    
    // Accept both 16-char (current) and 8-char (legacy) CRC
    const expectedCrc = generateCrc(machineId, keyId);
    if (crc === expectedCrc) {
      return { machineId, keyId, isNewFormat: true };
    }
    // Legacy 8-char CRC fallback (for keys created before the upgrade)
    const legacyCrc = crypto
      .createHmac("sha256", API_KEY_SECRET)
      .update(machineId + keyId)
      .digest("hex")
      .slice(0, 8);
    if (crc === legacyCrc) {
      return { machineId, keyId, isNewFormat: true };
    }
    
    return null;
  }
  
  // Old format: sk-{random8} = 2 parts
  if (parts.length === 2) {
    return { machineId: null, keyId: parts[1], isNewFormat: false };
  }
  
  return null;
}

/**
 * Verify API key CRC (only for new format)
 * @param {string} apiKey
 * @returns {boolean}
 */
export function verifyApiKeyCrc(apiKey) {
  const parsed = parseApiKey(apiKey);
  if (!parsed) return false;
  
  // Old format doesn't have CRC, always valid if parsed
  if (!parsed.isNewFormat) return true;
  
  // New format already verified in parseApiKey
  return true;
}

/**
 * Check if API key is new format (contains machineId)
 * @param {string} apiKey
 * @returns {boolean}
 */
export function isNewFormatKey(apiKey) {
  const parsed = parseApiKey(apiKey);
  return parsed?.isNewFormat === true;
}

