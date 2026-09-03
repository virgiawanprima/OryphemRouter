const MCP_FETCH_TIMEOUT_MS = 1e4;
const MCP_UPSTREAM_FETCH_TIMEOUT_MS = 6e4;
const MCP_FETCH_TIMEOUT_ENV = "OMNIROUTE_MCP_FETCH_TIMEOUT_MS";
const MCP_UPSTREAM_FETCH_TIMEOUT_ENV = "OMNIROUTE_MCP_UPSTREAM_TIMEOUT_MS";
function readPositiveIntEnv(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function readMcpTimeoutOverride(kind, env) {
  if (env === process.env) {
    return kind === "upstream" ? process.env.OMNIROUTE_MCP_UPSTREAM_TIMEOUT_MS : process.env.OMNIROUTE_MCP_FETCH_TIMEOUT_MS;
  }
  return env[kind === "upstream" ? MCP_UPSTREAM_FETCH_TIMEOUT_ENV : MCP_FETCH_TIMEOUT_ENV];
}
function resolveMcpFetchTimeoutMs(kind, env = process.env) {
  const override = readPositiveIntEnv(readMcpTimeoutOverride(kind, env));
  return override ?? (kind === "upstream" ? MCP_UPSTREAM_FETCH_TIMEOUT_MS : MCP_FETCH_TIMEOUT_MS);
}
function mcpFetchTimeoutSignal(kind, env) {
  return AbortSignal.timeout(resolveMcpFetchTimeoutMs(kind, env));
}
export {
  MCP_FETCH_TIMEOUT_ENV,
  MCP_FETCH_TIMEOUT_MS,
  MCP_UPSTREAM_FETCH_TIMEOUT_ENV,
  MCP_UPSTREAM_FETCH_TIMEOUT_MS,
  mcpFetchTimeoutSignal,
  resolveMcpFetchTimeoutMs
};
