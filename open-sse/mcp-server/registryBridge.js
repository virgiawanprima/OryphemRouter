// registryBridge.js
// ---------------------------------------------------------------------------
// Bridge that exposes the ported OmniRoute MCP tools (open-sse/mcp-server) to
// OryphemRouter as a flat, function-backed tool registry:
//
//   listPortedMcpTools() -> [{ name, description, inputSchema, handler, scopes }]
//
// Why this shape: OryphemRouter's MCP layer (src/lib/mcp, src/app/api/mcp)
// consumes MCP servers as stdio/SSE bridges that exchange JSON-RPC frames
// whose tool results carry `{ content: [...] }` blocks. A registered tool in
// the ported server already matches that contract — each entry has a zod
// `inputSchema` and a `handler(args, extra) => { content: [...] }` callback —
// so exposing them in-place means OryphemRouter can invoke these tools natively
// without spawning an external MCP child process.
//
// The authoritative source is the exact same `McpServer` instance the ported
// stdio entry point builds (server.js -> createMcpServer, built on
// @modelcontextprotocol/sdk), so the bridge always reflects precisely what the
// OmniRoute MCP server would advertise via tools/list. We read the SDK's
// internal registered-tool table (the only API that enumerates registered
// tools without a full transport handshake).
// ---------------------------------------------------------------------------

// The ported server compresses tool descriptions through OmniRoute's caveman
// compression pipeline (descriptionCompressor.js). That pipeline is not
// guaranteed to be wired up inside the OryphemRouter process, which would make
// createMcpServer() throw. Disable description compression while the registry
// is built (original, uncompressed descriptions are exposed instead) and
// restore the env afterwards so no other consumer is affected.
const COMPRESS_ENV_KEYS = [
  "OMNIROUTE_MCP_COMPRESS_DESCRIPTIONS",
  "OMNIROUTE_MCP_DESCRIPTION_COMPRESSION",
];

function disableDescriptionCompression() {
  return COMPRESS_ENV_KEYS.map((key) => {
    const prev = process.env[key];
    process.env[key] = "0";
    return { key, prev };
  });
}

function restoreEnv(saved) {
  for (const { key, prev } of saved) {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

// Lazily-built cache so repeated consumers don't rebuild the server each call.
let cachedRegistry = null;
let cachedScopes = null;

// Scopes are declared on the schema-level tool definitions (MCP_TOOLS) but are
// not stored on the SDK registered-tool objects, so we merge them in by name.
// Core tools keep their declared scopes; collection tools without a declared
// scope map default to [].
async function loadScopesMap() {
  if (cachedScopes) return cachedScopes;
  const { MCP_TOOLS } = await import("./schemas/tools.js");
  const map = {};
  for (const tool of MCP_TOOLS || []) {
    if (tool && typeof tool.name === "string") {
      map[tool.name] = Array.isArray(tool.scopes) ? tool.scopes : [];
    }
  }
  cachedScopes = map;
  return map;
}

async function buildRegistry() {
  const saved = disableDescriptionCompression();
  try {
    const [{ createMcpServer }, scopesMap] = await Promise.all([
      import("./server.js"),
      loadScopesMap()
    ]);
    const server = createMcpServer();
    // SDK internals: _registeredTools = { [toolName]: RegisteredTool } where
    // RegisteredTool = { description, inputSchema, handler, enabled, ... }.
    const registry = server && typeof server === "object" ? server._registeredTools : {};
    return Object.entries(registry)
      .filter(([, tool]) => tool && tool.enabled !== false)
      .map(([name, tool]) => ({
        name,
        description: typeof tool.description === "string" ? tool.description : "",
        inputSchema: tool.inputSchema || null,
        handler: typeof tool.handler === "function" ? tool.handler : null,
        scopes: scopesMap[name] || []
      }));
  } finally {
    restoreEnv(saved);
  }
}

/**
 * Returns the ported OmniRoute MCP tools as [{ name, description, inputSchema,
 * handler, scopes }]. Cached after the first call.
 */
export async function listPortedMcpTools() {
  if (!cachedRegistry) cachedRegistry = await buildRegistry();
  return cachedRegistry;
}

/**
 * Rebuilds the registry from a fresh McpServer instance (bypasses the cache).
 */
export async function refreshPortedMcpTools() {
  cachedRegistry = await buildRegistry();
  return cachedRegistry;
}

/**
 * Passthrough to the ported server factory — lets OryphemRouter run the full
 * OmniRoute MCP server (e.g. as a plugin entry) with the same env guard.
 */
export async function createPortedMcpServer() {
  const saved = disableDescriptionCompression();
  try {
    const { createMcpServer } = await import("./server.js");
    return createMcpServer();
  } finally {
    restoreEnv(saved);
  }
}
