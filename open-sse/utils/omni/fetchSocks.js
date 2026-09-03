// ADAPTED STUB — `fetch-socks` is not a dependency of OryphemRouter.
// `socksDispatcher` is reimplemented on top of undici's built-in SOCKS support
// (undici >= 6.10 supports socks4/socks4a/socks5/socks5h in ProxyAgent).
// Needed by open-sse/utils/proxyDispatcher.js.
import { ProxyAgent } from "undici";

/**
 * Build an undici-compatible SOCKS dispatcher (mirrors fetch-socks' `socksDispatcher`).
 * @param {{type?: number, host: string, port: number|string, userId?: string, password?: string}} socksOptions
 * @param {object} [options] undici dispatcher options (connections, keepAliveTimeout, ...)
 */
export function socksDispatcher(socksOptions = {}, options = {}) {
  const { host, port, userId, password, type } = socksOptions;
  const auth = userId
    ? `${encodeURIComponent(userId)}:${encodeURIComponent(password || "")}@`
    : "";
  const protocol = type === 4 ? "socks4" : "socks5h";
  const uri = `${protocol}://${auth}${host}:${port}`;
  return new ProxyAgent({ uri, ...options });
}
