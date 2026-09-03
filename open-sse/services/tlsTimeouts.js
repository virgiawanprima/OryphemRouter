// TLS client timeout config (ported from OmniRoute src/shared/utils/runtimeTimeouts).
export function getTlsClientTimeoutConfig() {
  return {
    tlsClientInitTimeoutMs: Number(process.env.TLS_CLIENT_INIT_TIMEOUT_MS) || 20_000,
    tlsClientRequestTimeoutMs: Number(process.env.TLS_CLIENT_REQUEST_TIMEOUT_MS) || 60_000,
  };
}
