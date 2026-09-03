import { fetch as undiciFetch } from "undici";
import { createProxyDispatcher, normalizeProxyUrl } from "./proxyDispatcher.js";
import { resolveProxyForScopeFromRegistry, listProxies, listOneproxyProxies } from "./omni/localDb.js";
import { isFeatureFlagEnabled } from "./omni/featureFlags.js";
const PROXY_FALLBACK_CACHE = /* @__PURE__ */ new Map();
const CACHE_TTL_MS = 5 * 60 * 1e3;
let proxyFallbackTestHooks = null;
function clearProxyFallbackCache() {
  PROXY_FALLBACK_CACHE.clear();
}
function __setProxyFallbackTestHooks(hooks) {
  proxyFallbackTestHooks = hooks;
}
function proxyRecordToUrl(proxy) {
  const auth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || "")}@` : "";
  return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
}
function cacheKeyForTarget(targetHostname, targetUrl) {
  try {
    const url = new URL(targetUrl);
    const normalizedPath = `${url.pathname || "/"}${url.search}`;
    return `${url.protocol}//${url.host}${normalizedPath}`;
  } catch {
    return targetHostname.toLowerCase();
  }
}
function resolveEnvProxyUrl(targetUrl) {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (noProxy) {
    let hostname;
    try {
      hostname = new URL(targetUrl).hostname.toLowerCase();
    } catch {
      return null;
    }
    const patterns = noProxy.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
    const match = patterns.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern.includes("*")) {
        const re = new RegExp(
          "^" + pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"
        );
        return re.test(hostname);
      }
      return hostname === pattern || hostname.endsWith(`.${pattern}`);
    });
    if (match) return null;
  }
  let protocol;
  try {
    protocol = new URL(targetUrl).protocol;
  } catch {
    return null;
  }
  const proxyUrl = protocol === "https:" ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy : process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  if (!proxyUrl) return null;
  try {
    return normalizeProxyUrl(proxyUrl, "environment proxy");
  } catch {
    return null;
  }
}
async function getProxyCandidates(targetUrl) {
  const candidates = /* @__PURE__ */ new Set();
  try {
    const globalProxy = await resolveProxyForScopeFromRegistry("global");
    if (globalProxy?.proxy) {
      candidates.add(proxyRecordToUrl(globalProxy.proxy));
    }
  } catch {
  }
  try {
    const { items: allProxies } = await listProxies({ includeSecrets: true });
    for (const p of allProxies) {
      if (p.host && p.port) {
        candidates.add(proxyRecordToUrl(p));
      }
    }
  } catch {
  }
  try {
    const oneproxyProxies = await listOneproxyProxies({ limit: 5 });
    for (const p of oneproxyProxies) {
      if (p.host && p.port) {
        candidates.add(proxyRecordToUrl(p));
      }
    }
  } catch {
  }
  if (targetUrl) {
    try {
      const envProxy = resolveEnvProxyUrl(targetUrl);
      if (envProxy) candidates.add(envProxy);
    } catch {
    }
  }
  return Array.from(candidates);
}
async function testSingleProxy(proxyUrl, targetUrl, timeoutMs = 3e3) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const dispatcher = createProxyDispatcher(proxyUrl);
    await undiciFetch(targetUrl, {
      method: "HEAD",
      signal: controller.signal,
      dispatcher,
      headers: {
        "User-Agent": "OmniRoute/1.0"
      }
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    return { ok: true, latencyMs };
  } catch {
    return { ok: false, latencyMs: null };
  }
}
async function testProxiesAgainstTarget(targetUrl, proxyUrls) {
  if (proxyUrls.length === 0) return [];
  const results = await Promise.allSettled(
    proxyUrls.map(async (proxyUrl) => {
      const result = await testSingleProxy(proxyUrl, targetUrl);
      return { proxyUrl, ...result };
    })
  );
  return results.map(
    (r) => r.status === "fulfilled" ? r.value : { proxyUrl: "unknown", ok: false, latencyMs: null }
  );
}
const inflightProbes = /* @__PURE__ */ new Map();
async function findWorkingProxy(targetHostname, targetUrl) {
  if (!targetHostname) return null;
  const cacheKey = cacheKeyForTarget(targetHostname, targetUrl);
  const cached = PROXY_FALLBACK_CACHE.get(cacheKey);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.proxyUrl || null;
    }
    PROXY_FALLBACK_CACHE.delete(cacheKey);
  }
  const existingProbe = inflightProbes.get(cacheKey);
  if (existingProbe) {
    return existingProbe;
  }
  const probe = (async () => {
    const candidates = await (proxyFallbackTestHooks?.getProxyCandidates ?? getProxyCandidates)(
      targetUrl
    );
    if (candidates.length === 0) {
      return null;
    }
    const results = await Promise.allSettled(
      candidates.map(async (proxyUrl) => {
        const { ok } = await (proxyFallbackTestHooks?.testSingleProxy ?? testSingleProxy)(
          proxyUrl,
          targetUrl
        );
        return { proxyUrl, ok };
      })
    );
    const working = results.find((r) => r.status === "fulfilled" && r.value.ok);
    if (working && working.status === "fulfilled") {
      const proxyUrl = working.value.proxyUrl;
      PROXY_FALLBACK_CACHE.set(cacheKey, {
        proxyUrl,
        expiresAt: Date.now() + CACHE_TTL_MS
      });
      return proxyUrl;
    }
    PROXY_FALLBACK_CACHE.set(cacheKey, {
      proxyUrl: "",
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    return null;
  })();
  inflightProbes.set(cacheKey, probe);
  try {
    return await probe;
  } finally {
    if (inflightProbes.get(cacheKey) === probe) {
      inflightProbes.delete(cacheKey);
    }
  }
}
async function selectWorkingProxyFallback(_connectionId) {
  if (!isFeatureFlagEnabled("PROXY_AUTO_SELECT_ENABLED")) return null;
  const candidates = await getProxyCandidates();
  if (candidates.length === 0) return null;
  const targetUrl = "https://api.openai.com/v1/models";
  const targetHostname = "api.openai.com";
  const workingUrl = await findWorkingProxy(targetHostname, targetUrl);
  if (!workingUrl) return null;
  try {
    const url = new URL(workingUrl);
    return {
      proxy: {
        type: url.protocol.replace(":", "") || "http",
        host: url.hostname,
        port: parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80),
        username: url.username ? decodeURIComponent(url.username) : "",
        password: url.password ? decodeURIComponent(url.password) : ""
      },
      level: "autoSelect",
      levelId: null,
      source: "automatic"
    };
  } catch {
    return null;
  }
}
export {
  __setProxyFallbackTestHooks,
  clearProxyFallbackCache,
  findWorkingProxy,
  getProxyCandidates,
  selectWorkingProxyFallback,
  testProxiesAgainstTarget,
  testSingleProxy
};
