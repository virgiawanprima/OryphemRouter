import "./setupPolyfill.js";
import { Agent, ProxyAgent } from "undici";
import { socksDispatcher } from "./omni/fetchSocks.js";
import { getUpstreamTimeoutConfig } from "./omni/runtimeTimeouts.js";
import { stripIpv6Brackets, detectIpLiteralFamily, parseProxyFamily } from "./proxyFamily.js";
import { createSocksDispatcherWithFamily } from "./socksConnectorWithFamily.js";
import { log } from "./log.js";
import {
  createRoundRobinDispatcher,
  getDefaultCachedDispatcher,
  getDispatcherCache,
  getRetryCachedDispatcher,
  setDefaultCachedDispatcher,
  setDispatcherCacheEntry,
  setRetryCachedDispatcher
} from "./proxyDispatcherCache.js";
import { __cacheProxyDispatcherForTest, clearDispatcherCache as clearDispatcherCache2 } from "./proxyDispatcherCache.js";
const SUPPORTED_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:", "socks5:"]);
const RELAY_TYPES = /* @__PURE__ */ new Set(["vercel", "deno", "cloudflare"]);
function isRelayType(type) {
  return typeof type === "string" && RELAY_TYPES.has(type);
}
const DEFAULT_PROXY_DISPATCHER_CONNECTIONS = 32;
const MAX_PROXY_DISPATCHER_CONNECTIONS = 256;
function getDispatcherOptions() {
  const timeouts = getUpstreamTimeoutConfig(process.env, (message) => {
    log.warn("PROXY_DISPATCHER", message);
  });
  return {
    headersTimeout: timeouts.fetchHeadersTimeoutMs,
    bodyTimeout: timeouts.fetchBodyTimeoutMs,
    connectTimeout: timeouts.fetchConnectTimeoutMs,
    keepAliveTimeout: timeouts.fetchKeepAliveTimeoutMs,
    // Without this, an upstream Keep-Alive: timeout=N header clamps
    // keepAliveTimeout UP to undici's default keepAliveMaxTimeout (600 s),
    // completely overriding the configured 1 s and restoring zombie-socket risk.
    keepAliveMaxTimeout: timeouts.fetchKeepAliveTimeoutMs,
    // 9router#1237: RFC 8305 Happy Eyeballs. undici does not
    // enable it by default, so when DNS returns both AAAA (IPv6) and A (IPv4)
    // and the IPv6 route is broken (e.g. NAT64 `64:ff9b::` without routing),
    // the direct egress connect hangs until ETIMEDOUT — even though `curl`
    // (which has Happy Eyeballs) reaches the same host. Race both families and
    // use whichever connects first. The proxy path pins family via `proxyTls`
    // and ProxyAgent ignores `connect`, so this only affects direct egress.
    // undici types `connect` as a union whose TcpNetConnectOpts member nominally
    // requires `port`; at runtime undici merges these into net.connect (the origin
    // already carries host:port), so the partial pin is valid — cast to suppress
    // the spurious missing-`port` error, mirroring the `proxyTls` cast below.
    connect: {
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 1e3
    }
  };
}
function getProxyDispatcherConnectionLimit(env = process.env) {
  const raw = env.OMNIROUTE_PROXY_DISPATCHER_CONNECTIONS;
  if (raw == null || raw.trim() === "") return DEFAULT_PROXY_DISPATCHER_CONNECTIONS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    log.warn(
      "PROXY_DISPATCHER",
      `Invalid OMNIROUTE_PROXY_DISPATCHER_CONNECTIONS="${raw}". Using default ${DEFAULT_PROXY_DISPATCHER_CONNECTIONS}.`
    );
    return DEFAULT_PROXY_DISPATCHER_CONNECTIONS;
  }
  return Math.min(Math.floor(parsed), MAX_PROXY_DISPATCHER_CONNECTIONS);
}
function getProxyDispatcherOptions(env = process.env) {
  const options = getDispatcherOptions();
  return {
    ...options,
    connections: getProxyDispatcherConnectionLimit(env),
    keepAliveTimeout: Math.max(options.keepAliveTimeout, 3e4),
    keepAliveMaxTimeout: Math.max(options.keepAliveMaxTimeout, 6e4),
    pipelining: 4
  };
}
function getDefaultDispatcherConnectionLimit(env = process.env) {
  const raw = env.OMNIROUTE_DIRECT_DISPATCHER_CONNECTIONS;
  if (raw == null || raw.trim() === "") return DEFAULT_PROXY_DISPATCHER_CONNECTIONS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    log.warn(
      "PROXY_DISPATCHER",
      `Invalid OMNIROUTE_DIRECT_DISPATCHER_CONNECTIONS="${raw}". Using default ${DEFAULT_PROXY_DISPATCHER_CONNECTIONS}.`
    );
    return DEFAULT_PROXY_DISPATCHER_CONNECTIONS;
  }
  return Math.min(Math.floor(parsed), MAX_PROXY_DISPATCHER_CONNECTIONS);
}
function getDefaultDispatcherOptions(env = process.env) {
  const options = getDispatcherOptions();
  return {
    ...options,
    connections: getDefaultDispatcherConnectionLimit(env),
    pipelining: 0
  };
}
function createRoundRobinDirectDispatcher(connectionLimit) {
  const baseOptions = getDispatcherOptions();
  const perAgentOptions = {
    ...baseOptions,
    connections: 1,
    pipelining: 0
  };
  const dispatchers = Array.from({ length: connectionLimit }, () => new Agent(perAgentOptions));
  return createRoundRobinDispatcher(dispatchers);
}
function getDefaultDispatcher() {
  let dispatcher = getDefaultCachedDispatcher();
  if (!dispatcher) {
    dispatcher = createRoundRobinDirectDispatcher(getDefaultDispatcherConnectionLimit());
    setDefaultCachedDispatcher(dispatcher);
  }
  return dispatcher;
}
function getRetryDispatcher() {
  let dispatcher = getRetryCachedDispatcher();
  if (!dispatcher) {
    dispatcher = new Agent({
      ...getDispatcherOptions(),
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1,
      pipelining: 0
    });
    setRetryCachedDispatcher(dispatcher);
  }
  return dispatcher;
}
function extractExplicitPort(urlStr) {
  try {
    const idx = urlStr.indexOf("://");
    if (idx === -1) return null;
    const authorityStart = idx + 3;
    const authorityEnd = urlStr.indexOf("/", authorityStart);
    const authority = authorityEnd === -1 ? urlStr.slice(authorityStart) : urlStr.slice(authorityStart, authorityEnd);
    const lastColon = authority.lastIndexOf(":");
    const atSign = authority.lastIndexOf("@");
    if (lastColon !== -1 && lastColon > atSign) {
      const portStr = authority.slice(lastColon + 1);
      if (/^\d+$/.test(portStr)) {
        const port = Number(portStr);
        if (Number.isInteger(port) && port >= 1 && port <= 65535) return String(port);
      }
    }
  } catch {
  }
  return null;
}
function defaultPortForProtocol(protocol) {
  if (protocol === "https:" || protocol === "wss:") return "443";
  if (protocol === "socks5:") return "1080";
  return "8080";
}
function normalizePort(port, protocol) {
  if (!port) return defaultPortForProtocol(protocol);
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("[ProxyDispatcher] Invalid proxy port");
  }
  return String(parsed);
}
function buildProxyUrlString(parsed, port) {
  const auth = parsed.username || parsed.password ? `${parsed.username}:${parsed.password}@` : "";
  return `${parsed.protocol}//${auth}${parsed.hostname}:${port}`;
}
function isSocks5ProxyEnabled() {
  const raw = (process.env.ENABLE_SOCKS5_PROXY ?? "").trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(raw);
}
function proxyUrlForLogs(proxyUrl) {
  const explicitPort = extractExplicitPort(proxyUrl);
  const parsed = new URL(proxyUrl);
  const port = explicitPort || parsed.port || defaultPortForProtocol(parsed.protocol);
  return `${parsed.protocol}//${parsed.hostname}:${port}`;
}
function normalizeProxyUrl(proxyUrl, source = "proxy", { allowSocks5 = isSocks5ProxyEnabled() } = {}) {
  const familyMatch = proxyUrl.match(/\?family=(ipv4|ipv6)$/);
  const familySuffix = familyMatch ? familyMatch[0] : "";
  const baseUrl = familySuffix ? proxyUrl.slice(0, -familySuffix.length) : proxyUrl;
  const explicitPort = extractExplicitPort(baseUrl);
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`[ProxyDispatcher] Invalid ${source} URL`);
  }
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `[ProxyDispatcher] Unsupported ${source} protocol: ${parsed.protocol.replace(":", "")}`
    );
  }
  if (parsed.protocol === "socks5:" && !allowSocks5) {
    throw new Error(
      "[ProxyDispatcher] SOCKS5 proxy is disabled (remove ENABLE_SOCKS5_PROXY=false to enable \u2014 it is ON by default)"
    );
  }
  if (!parsed.hostname) {
    throw new Error(`[ProxyDispatcher] Invalid ${source} host`);
  }
  const port = explicitPort || normalizePort(parsed.port, parsed.protocol);
  const fam = parseProxyFamily(
    (familyMatch ? familyMatch[1] : parsed.searchParams.get("family")) ?? void 0
  );
  const base = buildProxyUrlString(parsed, port);
  return fam === "auto" ? base : `${base}?family=${fam}`;
}
function buildVercelRelayHeaders(targetUrl, relayAuth) {
  const parsed = new URL(targetUrl);
  return {
    "x-relay-target": `${parsed.protocol}//${parsed.host}`,
    "x-relay-path": parsed.pathname + parsed.search,
    "x-relay-auth": relayAuth
  };
}
const buildRelayHeaders = buildVercelRelayHeaders;
function proxyConfigToUrl(proxyConfig, { allowSocks5 = isSocks5ProxyEnabled() } = {}) {
  if (!proxyConfig) return null;
  if (typeof proxyConfig === "string") {
    return normalizeProxyUrl(proxyConfig, "context proxy", { allowSocks5 });
  }
  if (typeof proxyConfig !== "object" || Array.isArray(proxyConfig)) {
    throw new Error("[ProxyDispatcher] Invalid context proxy config");
  }
  const config = proxyConfig;
  if (!config.host) return null;
  const type = String(config.type || "http").toLowerCase();
  if (RELAY_TYPES.has(type)) {
    return config.host ? `https://${config.host}` : null;
  }
  const protocol = `${type}:`;
  if (!SUPPORTED_PROTOCOLS.has(protocol)) {
    throw new Error(`[ProxyDispatcher] Unsupported context proxy protocol: ${type}`);
  }
  if (protocol === "socks5:" && !allowSocks5) {
    throw new Error(
      "[ProxyDispatcher] SOCKS5 proxy is disabled (remove ENABLE_SOCKS5_PROXY=false to enable \u2014 it is ON by default)"
    );
  }
  const port = normalizePort(config.port, protocol);
  const auth = config.username || config.password ? `${encodeURIComponent(config.username || "")}:${encodeURIComponent(config.password || "")}@` : "";
  const proxyUrlStr = `${type}://${auth}${config.host}:${port}`;
  const fam = parseProxyFamily(config.family);
  const normalized = normalizeProxyUrl(proxyUrlStr, "context proxy", { allowSocks5 });
  return fam === "auto" ? normalized : `${normalized}?family=${fam}`;
}
function resolveDispatcherFamily(parsed) {
  const directive = parseProxyFamily(parsed.searchParams.get("family") ?? void 0);
  const literal = detectIpLiteralFamily(parsed.hostname);
  if (directive === "auto") return literal;
  const want = directive === "ipv6" ? 6 : 4;
  if (literal !== null && literal !== want) {
    throw new Error(
      `[ProxyDispatcher] Proxy family directive ${directive} contradicts ${literal === 6 ? "IPv6" : "IPv4"} literal host`
    );
  }
  return want;
}
function __resolveDispatcherFamilyForTest(proxyUrl) {
  return resolveDispatcherFamily(new URL(proxyUrl));
}
function __getProxyDispatcherOptionsForTest(env = process.env) {
  return getProxyDispatcherOptions(env);
}
function __getDefaultDispatcherOptionsForTest(env = process.env) {
  return getDefaultDispatcherOptions(env);
}
function __createRoundRobinDispatcherForTest(dispatchers) {
  return createRoundRobinDispatcher(dispatchers);
}
function buildProxyDispatcher(normalizedUrl, options) {
  const parsed = new URL(normalizedUrl);
  const family = resolveDispatcherFamily(parsed);
  parsed.searchParams.delete("family");
  const cleanUri = normalizedUrl.replace(/\?family=(ipv4|ipv6)$/, "");
  const explicitPort = extractExplicitPort(cleanUri);
  const port = explicitPort || normalizePort(parsed.port, parsed.protocol);
  if (parsed.protocol === "socks5:") {
    const socksOptions = {
      type: 5,
      host: stripIpv6Brackets(parsed.hostname),
      port: Number(port)
    };
    if (parsed.username) socksOptions.userId = decodeURIComponent(parsed.username);
    if (parsed.password) socksOptions.password = decodeURIComponent(parsed.password);
    return family === null ? socksDispatcher(
      socksOptions,
      options
    ) : createSocksDispatcherWithFamily(
      socksOptions,
      family,
      options
    );
  }
  return new ProxyAgent({
    uri: cleanUri,
    // undici 8.6+ forwards plain-HTTP requests through the proxy as an origin
    // request (GET http://host/…) instead of a CONNECT tunnel; upstream proxies
    // that only speak CONNECT then reject it (501). OmniRoute tunnels ALL proxied
    // traffic (HTTP + HTTPS) via CONNECT, so force tunneling. Unknown option on
    // undici <8.6 → silently ignored (that version already tunneled by default).
    proxyTunnel: true,
    ...options,
    ...family !== null ? { proxyTls: { family, autoSelectFamily: false } } : {}
  });
}
function createProxyDispatcher(proxyUrl) {
  const normalizedUrl = normalizeProxyUrl(proxyUrl, "proxy dispatcher");
  const dispatcherCache = getDispatcherCache();
  let dispatcher = dispatcherCache.get(normalizedUrl);
  if (dispatcher) return dispatcher;
  dispatcher = buildProxyDispatcher(normalizedUrl, getProxyDispatcherOptions());
  const winner = dispatcherCache.get(normalizedUrl);
  if (winner) {
    void dispatcher.close().catch(() => {
    });
    return winner;
  }
  setDispatcherCacheEntry(normalizedUrl, dispatcher);
  return dispatcher;
}
function getProxyRetryDispatcher(proxyUrl) {
  const normalizedUrl = normalizeProxyUrl(proxyUrl, "proxy dispatcher");
  const dispatcherCache = getDispatcherCache();
  const retryKey = `retry:${normalizedUrl}`;
  let dispatcher = dispatcherCache.get(retryKey);
  if (dispatcher) return dispatcher;
  dispatcher = buildProxyDispatcher(normalizedUrl, {
    ...getProxyDispatcherOptions(),
    // Retry needs exactly one fresh socket (not the inherited connection pool).
    connections: 1,
    keepAliveTimeout: 1,
    keepAliveMaxTimeout: 1,
    pipelining: 0
  });
  const winner = dispatcherCache.get(retryKey);
  if (winner) {
    void dispatcher.close().catch(() => {
    });
    return winner;
  }
  setDispatcherCacheEntry(retryKey, dispatcher);
  return dispatcher;
}
function __getSocksOptionsForTest(proxyUrl) {
  const normalizedUrl = normalizeProxyUrl(proxyUrl, "proxy dispatcher");
  const parsed = new URL(normalizedUrl);
  parsed.searchParams.delete("family");
  const explicitPort = extractExplicitPort(normalizedUrl);
  const port = explicitPort || normalizePort(parsed.port, parsed.protocol);
  const socksOptions = {
    type: 5,
    host: stripIpv6Brackets(parsed.hostname),
    port: Number(port)
  };
  if (parsed.username) socksOptions.userId = decodeURIComponent(parsed.username);
  if (parsed.password) socksOptions.password = decodeURIComponent(parsed.password);
  return socksOptions;
}
export {
  RELAY_TYPES,
  __cacheProxyDispatcherForTest,
  __createRoundRobinDispatcherForTest,
  __getDefaultDispatcherOptionsForTest,
  __getProxyDispatcherOptionsForTest,
  __getSocksOptionsForTest,
  __resolveDispatcherFamilyForTest,
  buildRelayHeaders,
  buildVercelRelayHeaders,
  clearDispatcherCache2 as clearDispatcherCache,
  createProxyDispatcher,
  getDefaultDispatcher,
  getDefaultDispatcherConnectionLimit,
  getProxyDispatcherConnectionLimit,
  getProxyRetryDispatcher,
  getRetryDispatcher,
  isRelayType,
  isSocks5ProxyEnabled,
  normalizeProxyUrl,
  proxyConfigToUrl,
  proxyUrlForLogs
};
