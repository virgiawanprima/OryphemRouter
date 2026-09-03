// Proxies — provider-level proxy resolution for ported open-sse code
// (browserPool.js imports resolveProxyForProvider from here).
//
// Resolves a usable proxy for a provider from its active connections that are
// assigned to a proxy pool. Returns null (direct egress) when no proxy is
// assigned or configured — never throws, never blocks.

import { getProviderConnections } from "./repos/connectionsRepo.js";
import { getProxyPoolById } from "./repos/proxyPoolsRepo.js";

function normalizeString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function looksLikeProxyUrl(raw) {
  if (!raw) return false;
  const cleaned = normalizeString(raw);
  return /^(https?|socks5):\/\//i.test(cleaned) || /^[^:/\s]+:\d{2,5}$/.test(cleaned);
}

/**
 * Parse a proxy URL (http/https/socks5) into { host, port, type, username, password }.
 * Returns null when the URL is not parseable.
 */
export function parseProxyUrl(proxyUrl) {
  if (!proxyUrl) return null;
  const cleaned = normalizeString(proxyUrl);
  try {
    const url = new URL(cleaned.includes("://") ? cleaned : `http://${cleaned}`);
    const type = url.protocol === "socks5:" ? "socks5" : "http";
    const host = url.hostname;
    const port = url.port ? Number(url.port) : type === "socks5" ? 1080 : 80;
    if (!host || !port) return null;
    return {
      host,
      port,
      type,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the first usable proxy for a provider (from its active connections
 * assigned to an active proxy pool). Returns null when none is available.
 * @param {string} providerKey - provider id (canonical or alias)
 * @returns {Promise<{host:string, port:number, type:string, username?:string, password?:string}|null>}
 */
export async function resolveProxyForProvider(providerKey) {
  try {
    const connections = await getProviderConnections({ provider: providerKey });
    for (const conn of connections || []) {
      const raw = conn?.providerSpecificData || {};
      const proxyPoolId = normalizeString(raw.proxyPoolId);
      if (!proxyPoolId || proxyPoolId === "__none__") continue;
      const pool = await getProxyPoolById(proxyPoolId);
      if (!pool || pool.isActive !== true) continue;
      const proxyUrl = normalizeString(pool.proxyUrl);
      if (!proxyUrl || !looksLikeProxyUrl(proxyUrl)) continue;
      const parsed = parseProxyUrl(proxyUrl);
      if (parsed) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Whether any active connection for the provider is assigned to a blocking proxy.
 * @param {string} providerKey
 * @returns {Promise<boolean>}
 */
export async function hasBlockingProxyAssignmentForProvider(providerKey) {
  try {
    const connections = await getProviderConnections({ provider: providerKey });
    return (connections || []).some((conn) => {
      const raw = conn?.providerSpecificData || {};
      const proxyPoolId = normalizeString(raw.proxyPoolId);
      return proxyPoolId && proxyPoolId !== "__none__";
    });
  } catch {
    return false;
  }
}
