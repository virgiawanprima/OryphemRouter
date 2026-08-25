// SSRF guard: block internal/private/metadata targets for server-side fetch.
// Resolves DNS and validates every A/AAAA record so rebinding and obfuscated
// IP literals (decimal/hex/octal, IPv4-mapped IPv6) are caught at connect time.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost"];

// Parse dotted IPv4 to 32-bit integer, or null if not a valid IPv4 literal.
function ipv4ToInt(host) {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

// Private/reserved IPv4 ranges as [startInt, maskBits].
// Includes RFC 1918, RFC 6598 (CGNAT), RFC 5737 (TEST-NET),
// RFC 2544 (benchmark), RFC 3927 (link-local), multicast, and reserved.
const BLOCKED_V4_RANGES = [
  [ipv4ToInt("0.0.0.0"), 8],         // Current network / "this" network
  [ipv4ToInt("10.0.0.0"), 8],         // RFC 1918 private
  [ipv4ToInt("100.64.0.0"), 10],      // RFC 6598 CGNAT
  [ipv4ToInt("127.0.0.0"), 8],        // Loopback
  [ipv4ToInt("169.254.0.0"), 16],     // RFC 3927 link-local
  [ipv4ToInt("172.16.0.0"), 12],      // RFC 1918 private
  [ipv4ToInt("192.0.0.0"), 24],       // RFC 6890 reserved (inc. 192.0.0.8/32)
  [ipv4ToInt("192.0.2.0"), 24],       // RFC 5737 TEST-NET-1
  [ipv4ToInt("192.168.0.0"), 16],     // RFC 1918 private
  [ipv4ToInt("198.18.0.0"), 15],      // RFC 2544 benchmark
  [ipv4ToInt("198.51.100.0"), 24],    // RFC 5737 TEST-NET-2
  [ipv4ToInt("203.0.113.0"), 24],     // RFC 5737 TEST-NET-3
  [ipv4ToInt("224.0.0.0"), 4],        // Multicast
  [ipv4ToInt("240.0.0.0"), 4],        // Reserved / future use
];

function isBlockedIpv4(host) {
  const ip = ipv4ToInt(host);
  if (ip === null) return false;
  return BLOCKED_V4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ip & mask) === (base & mask);
  });
}

// Parse an IPv6 literal into 16 bytes. Handles "::" compression and an embedded
// IPv4 tail (dotted-decimal or hex forms like ::ffff:7f00:1). Returns null if invalid.
function ipv6ToBytes(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return null;
  const bytes = new Uint8Array(16);

  const writeGroups = (groups, offset) => {
    let o = offset;
    for (const g of groups) {
      if (g === "") continue;
      if (g.includes(".")) {
        const v4 = g.split(".").map(Number);
        if (v4.length !== 4 || v4.some((n) => Number.isNaN(n) || n > 255 || n < 0)) return null;
        bytes[o++] = v4[0]; bytes[o++] = v4[1]; bytes[o++] = v4[2]; bytes[o++] = v4[3];
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        const val = parseInt(g, 16);
        bytes[o++] = (val >> 8) & 0xff;
        bytes[o++] = val & 0xff;
      }
    }
    return o;
  };

  if (h.includes("::")) {
    const [leftPart, rightPart] = h.split("::");
    if (rightPart === undefined || rightPart.includes("::")) return null;
    const left = leftPart ? leftPart.split(":") : [];
    const right = rightPart ? rightPart.split(":") : [];
    const consumed = writeGroups(left, 0);
    if (consumed === null) return null;
    const rightBytes = right.reduce((sum, g) => sum + (g.includes(".") ? 4 : 2), 0);
    const rightStart = 16 - rightBytes;
    if (rightStart < consumed) return null;
    if (writeGroups(right, rightStart) === null) return null;
    return bytes;
  }

  if (writeGroups(h.split(":"), 0) !== 16) return null;
  return bytes;
}

function isBlockedIpv6(host) {
  const bytes = ipv6ToBytes(host);
  if (!bytes) return false;

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — first 10 bytes zero, bytes 10-11 = ff ff.
  let mapped = true;
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) { mapped = false; break; }
  if (mapped && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isBlockedIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  // ::1 loopback
  if (bytes[15] === 1 && bytes.slice(0, 15).every((b) => b === 0)) return true;
  // :: unspecified
  if (bytes.every((b) => b === 0)) return true;
  // fe80::/10 link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
  // fc00::/7 unique-local
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  return false;
}

/**
 * Throw if URL targets a non-public host. Async: resolves DNS and validates
 * every resolved address, closing DNS-rebinding and obfuscated-literal bypasses.
 * @param {string} rawUrl
 */
export async function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Blocked URL: invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Blocked URL: non-http(s) scheme");
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("Blocked URL: internal host");
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new Error("Blocked URL: internal host");

  // Pure-decimal literals (e.g. 2130706433) alias private IPs ambiguously.
  if (/^\d+$/.test(host)) throw new Error("Blocked URL: numeric literal");

  const version = isIP(host);
  if (version === 4) {
    if (isBlockedIpv4(host)) throw new Error("Blocked URL: private IP");
    return;
  }
  if (version === 6) {
    if (isBlockedIpv6(host)) throw new Error("Blocked URL: private IP");
    return;
  }

  // Resolve every record; reject if ANY is private (defeats multi-A tricks).
  let records;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Blocked URL: DNS resolution failed");
  }
  if (!records.length) throw new Error("Blocked URL: no DNS records");
  for (const r of records) {
    const addr = String(r.address);
    if (isIP(addr) === 4 && isBlockedIpv4(addr)) throw new Error("Blocked URL: private IP");
    if (isIP(addr) === 6 && isBlockedIpv6(addr)) throw new Error("Blocked URL: private IP");
  }
}

/**
 * True if `host` (hostname or IP literal, no port) is a loopback, private,
 * link-local, reserved, or internal host — i.e. NOT a public internet host.
 * Reuses the same classification as assertPublicUrl's pre-resolution checks so
 * URL-based host allowlists can permit "private/local self-hosted" targets
 * (e.g. a self-hosted GitLab) while still rejecting arbitrary public
 * attacker-controlled domains.
 * @param {string} host
 * @returns {boolean}
 */
export function isPrivateHost(host) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true;
  // Pure-decimal literals (e.g. 2130706433) alias private IPs ambiguously.
  if (/^\d+$/.test(h)) return true;
  const version = isIP(h);
  if (version === 4) return isBlockedIpv4(h);
  if (version === 6) return isBlockedIpv6(h);
  return false;
}

const MAX_REDIRECTS = 4;

// Header name suffixes whose presence signals an auth-bearing header
// (case-insensitive prefix match against the lowercased header name).
const AUTH_SENSITIVE_HEADERS = ["authorization", "x-api-key", "proxy-authorization"];

/**
 * Return a copy of `headers` with any auth-bearing entries stripped.
 * Used before redirecting to a different origin to avoid credential
 * leakage (307/308 preserve the request body and headers by default).
 * @param {Record<string,string>|undefined} headers
 * @returns {Record<string,string>|undefined}
 */
function stripAuthHeaders(headers) {
  if (!headers) return headers;
  // Normalize Headers instance to a plain object for uniform processing.
  const entries = typeof headers.entries === "function" ? [...headers.entries()] : Object.entries(headers);
  const cleaned = {};
  let changed = false;
  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (AUTH_SENSITIVE_HEADERS.some((s) => lower.startsWith(s))) {
      changed = true;
      continue; // skip it
    }
    cleaned[key] = value;
  }
  return changed ? cleaned : headers;
}

/**
 * Return the origin (protocol + host) from a URL string.
 * @param {string} url
 * @returns {string}
 */
function getOrigin(url) {
  const u = new URL(url);
  return u.protocol + "//" + u.host;
}

/**
 * SSRF-safe fetch: validates every hop with assertPublicUrl and follows
 * redirects manually so a public URL can never redirect into an internal
 * address (classic SSRF redirect bypass). Fails open to `redirect: "error"`
 * when a hop is private/unresolvable.
 *
 * Authorization / X-API-Key headers are stripped on cross-origin redirects
 * to prevent credential leakage (M03).
 *
 * @param {string} url - initial URL (validated before any request)
 * @param {RequestInit} [init] - fetch options (redirect is forced)
 * @returns {Promise<Response>}
 */
export async function fetchPublicUrl(url, init = {}) {
  await assertPublicUrl(url);
  let current = url;
  let currentOrigin = getOrigin(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      // Manual redirect: validate the next hop, then continue.
      current = new URL(res.headers.get("location"), current).toString();
      await assertPublicUrl(current);
      const nextOrigin = getOrigin(current);
      // 307/308 preserve the original method and headers — strip auth
      // headers when the origin changes to avoid leaking credentials.
      if (nextOrigin !== currentOrigin) {
        init = { ...init, headers: stripAuthHeaders(init.headers) };
        currentOrigin = nextOrigin;
      }
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
