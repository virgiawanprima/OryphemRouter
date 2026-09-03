import dns from "node:dns/promises";
import { detectIpLiteralFamily, stripIpv6Brackets } from "./proxyFamily.js";
const defaultLookup = (hostname) => dns.lookup(hostname, { all: true });
const FAMILY_CHECK_POSITIVE_TTL_MS = 3e5;
const FAMILY_CHECK_NEGATIVE_TTL_MS = 2e3;
const familyCheckCache = /* @__PURE__ */ new Map();
const familyCheckInflight = /* @__PURE__ */ new Map();
async function assertHostnameSupportsFamily(host, family, lookupFn = defaultLookup) {
  if (detectIpLiteralFamily(host) !== null) return;
  const cacheKey = `${host}:${family}`;
  const cached = familyCheckCache.get(cacheKey);
  if (cached && cached.lookupFn === lookupFn) {
    const ttl = cached.ok ? FAMILY_CHECK_POSITIVE_TTL_MS : FAMILY_CHECK_NEGATIVE_TTL_MS;
    if (Date.now() - cached.checkedAt < ttl) {
      if (!cached.ok) throw new Error(cached.message);
      return;
    }
    familyCheckCache.delete(cacheKey);
  }
  const inflight = familyCheckInflight.get(cacheKey);
  if (inflight) {
    await inflight;
    return;
  }
  const probe = (async () => {
    let records;
    try {
      records = await lookupFn(stripIpv6Brackets(host));
    } catch (err) {
      const message = `[ProxyFamily] DNS resolution failed for ${host}; refusing to egress (fail-closed): ${err instanceof Error ? err.message : String(err)}`;
      familyCheckCache.set(cacheKey, { lookupFn, checkedAt: Date.now(), ok: false, message });
      throw new Error(message);
    }
    const hasFamily = records.some((r) => r.family === family);
    if (!hasFamily) {
      const message = `[ProxyFamily] Proxy host ${host} has no ${family === 6 ? "IPv6 (AAAA)" : "IPv4 (A)"} record; refusing ${family === 6 ? "IPv6" : "IPv4"}-only egress (fail-closed)`;
      familyCheckCache.set(cacheKey, { lookupFn, checkedAt: Date.now(), ok: false, message });
      throw new Error(message);
    }
    familyCheckCache.set(cacheKey, { lookupFn, checkedAt: Date.now(), ok: true });
  })();
  familyCheckInflight.set(cacheKey, probe);
  try {
    await probe;
  } finally {
    if (familyCheckInflight.get(cacheKey) === probe) {
      familyCheckInflight.delete(cacheKey);
    }
  }
}
function __clearFamilyCheckCacheForTest() {
  familyCheckCache.clear();
  familyCheckInflight.clear();
}
export {
  __clearFamilyCheckCacheForTest,
  assertHostnameSupportsFamily
};
