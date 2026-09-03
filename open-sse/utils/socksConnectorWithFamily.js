import { Agent, buildConnector } from "undici";
import { SocksClient } from "socks";
const DEFAULT_SOCKS_HANDSHAKE_TIMEOUT_MS = 1e4;
const MAX_SOCKS_HANDSHAKE_TIMEOUT_MS = 12e4;
function resolveSocksHandshakeTimeoutMs(env = process.env) {
  const raw = env.SOCKS_HANDSHAKE_TIMEOUT_MS;
  if (raw == null || raw.trim() === "") return DEFAULT_SOCKS_HANDSHAKE_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_SOCKS_HANDSHAKE_TIMEOUT_MS;
  return Math.min(Math.floor(parsed), MAX_SOCKS_HANDSHAKE_TIMEOUT_MS);
}
function buildSocksFamilySocketOptions(family) {
  if (family === 6) return { family: 6, autoSelectFamily: false };
  if (family === 4) return { family: 4, autoSelectFamily: false };
  return {};
}
function resolvePort(protocol, port) {
  return port ? Number.parseInt(port, 10) : protocol === "http:" ? 80 : 443;
}
function socksConnectorWithFamily(proxy, family, tlsOpts = {}) {
  const undiciConnect = buildConnector(tlsOpts);
  const socketOptions = buildSocksFamilySocketOptions(family);
  return async (options, callback) => {
    const { protocol, hostname, port, httpSocket } = options;
    try {
      const r = await SocksClient.createConnection({
        command: "connect",
        proxy,
        timeout: resolveSocksHandshakeTimeoutMs(),
        destination: { host: hostname, port: resolvePort(protocol, port) },
        existing_socket: httpSocket,
        socket_options: socketOptions
      });
      const sock = r.socket;
      if (protocol !== "https:") {
        return callback(null, sock.setNoDelay());
      }
      return undiciConnect({ ...options, httpSocket: sock }, callback);
    } catch (error) {
      return callback(error, null);
    }
  };
}
function createSocksDispatcherWithFamily(proxy, family, agentOptions = {}) {
  const { connect, ...rest } = agentOptions;
  return new Agent({
    ...rest,
    connect: socksConnectorWithFamily(proxy, family, connect)
  });
}
export {
  buildSocksFamilySocketOptions,
  createSocksDispatcherWithFamily,
  resolveSocksHandshakeTimeoutMs
};
