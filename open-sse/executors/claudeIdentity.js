import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  CLAUDE_CODE_CLIENT_VERSION,
  CLAUDE_CODE_SDK_PACKAGE_VERSION
} from "../utils/omni/claudeCodeClient.js";
const CLAUDE_CODE_VERSION = CLAUDE_CODE_CLIENT_VERSION;
const CLAUDE_CODE_STAINLESS_VERSION = CLAUDE_CODE_SDK_PACKAGE_VERSION;
function stainlessOS() {
  switch (process.platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "MacOS";
    case "linux":
      return "Linux";
    case "freebsd":
      return "FreeBSD";
    default:
      return "Unknown";
  }
}
function stainlessArch() {
  switch (process.arch) {
    case "x64":
      return "x64";
    case "arm64":
      return "arm64";
    case "ia32":
      return "x32";
    default:
      return process.arch;
  }
}
function stainlessRuntimeVersion() {
  return process.version;
}
const IDENTITY_CACHE_LIMIT = 1e4;
const BOOTSTRAP_FETCH_TIMEOUT_MS = 1e4;
function setBounded(m, key, value, max) {
  if (!m.has(key) && m.size >= max) {
    const oldest = m.keys().next().value;
    if (oldest !== void 0) m.delete(oldest);
  }
  m.set(key, value);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function passthroughUpstreamSessionId(clientHeaders) {
  if (!clientHeaders) return null;
  const raw = clientHeaders["x-claude-code-session-id"] ?? clientHeaders["X-Claude-Code-Session-Id"];
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return UUID_RE.test(v) ? v : null;
}
const sessionCache = /* @__PURE__ */ new Map();
function getSessionId(seed) {
  let id = sessionCache.get(seed);
  if (id) return id;
  id = randomUUID();
  setBounded(sessionCache, seed, id, IDENTITY_CACHE_LIMIT);
  return id;
}
function generateCliUserID() {
  return randomBytes(32).toString("hex");
}
const lazyCliUserIDCache = /* @__PURE__ */ new Map();
const HEX64_RE = /^[a-f0-9]{64}$/i;
function resolveCliUserID(providerSpecificData, seed) {
  const cli = providerSpecificData?.cliUserID;
  if (typeof cli === "string" && HEX64_RE.test(cli)) return cli;
  const alt = providerSpecificData?.userID;
  if (typeof alt === "string" && HEX64_RE.test(alt)) return alt;
  let cached = lazyCliUserIDCache.get(seed);
  if (cached) return cached;
  cached = generateCliUserID();
  setBounded(lazyCliUserIDCache, seed, cached, IDENTITY_CACHE_LIMIT);
  return cached;
}
const ACCOUNT_FETCH_RETRY_MS = 5 * 60 * 1e3;
const accountUuidCache = /* @__PURE__ */ new Map();
const inflightFetches = /* @__PURE__ */ new Set();
async function fetchClaudeBootstrap(accessToken) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BOOTSTRAP_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/api/claude_cli/bootstrap", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
        "anthropic-beta": "oauth-2025-04-20"
      },
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const acct = data && typeof data === "object" ? data.oauth_account : null;
    if (!acct || typeof acct !== "object") return null;
    const account = acct;
    const stringOrNull = (value) => typeof value === "string" ? value : null;
    return {
      account_uuid: stringOrNull(account.account_uuid),
      account_email: stringOrNull(account.account_email),
      organization_uuid: stringOrNull(account.organization_uuid),
      organization_name: stringOrNull(account.organization_name),
      organization_type: stringOrNull(account.organization_type),
      organization_rate_limit_tier: stringOrNull(account.organization_rate_limit_tier)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function backgroundFetchAccountUUID(accessToken, seed) {
  if (inflightFetches.has(seed)) return;
  const cached = accountUuidCache.get(seed);
  if (cached?.uuid) return;
  if (cached && Date.now() - cached.fetchedAt < ACCOUNT_FETCH_RETRY_MS) return;
  inflightFetches.add(seed);
  try {
    const bootstrap = await fetchClaudeBootstrap(accessToken);
    setBounded(
      accountUuidCache,
      seed,
      { uuid: bootstrap?.account_uuid ?? null, fetchedAt: Date.now() },
      IDENTITY_CACHE_LIMIT
    );
  } finally {
    inflightFetches.delete(seed);
  }
}
function uuidV4FromHash(hex64) {
  return [
    hex64.slice(0, 8),
    hex64.slice(8, 12),
    "4" + hex64.slice(13, 16),
    (parseInt(hex64.charAt(16), 16) & 3 | 8).toString(16) + hex64.slice(17, 20),
    hex64.slice(20, 32)
  ].join("-");
}
function resolveAccountUUID(providerSpecificData, seed, accessToken) {
  const camel = providerSpecificData?.accountUUID;
  if (typeof camel === "string" && camel.length >= 32) return camel;
  const snake = providerSpecificData?.account_uuid;
  if (typeof snake === "string" && snake.length >= 32) return snake;
  const cached = accountUuidCache.get(seed);
  if (cached?.uuid) return cached.uuid;
  if (accessToken) void backgroundFetchAccountUUID(accessToken, seed);
  return uuidV4FromHash(
    createHash("sha256").update("account:" + seed).digest("hex")
    // nosemgrep: insufficient-password-hash
  );
}
function buildUserIdJson(opts) {
  return JSON.stringify({
    device_id: opts.deviceId,
    account_uuid: opts.accountUUID,
    session_id: opts.sessionId
  });
}
function parseUpstreamMetadataUserId(body) {
  if (!body) return null;
  const md = body.metadata;
  const raw = md?.user_id;
  if (typeof raw !== "string" || raw.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { device_id, account_uuid, session_id } = parsed;
  if (typeof device_id !== "string" || !HEX64_RE.test(device_id) || typeof account_uuid !== "string" || !UUID_RE.test(account_uuid) || typeof session_id !== "string" || !UUID_RE.test(session_id)) {
    return null;
  }
  return { device_id, account_uuid, session_id };
}
const HEAVY_AGENT_BETA_MODEL_PREFIXES = ["claude-opus", "claude-sonnet"];
const CONTEXT_1M_BETA_MODEL_PREFIXES = ["claude-opus"];
const CONTEXT_1M_NATIVE_MODEL_PREFIXES = ["claude-opus-5"];
function matchesModelPrefix(model, prefixes) {
  if (typeof model !== "string") return false;
  const normalized = model.toLowerCase();
  return prefixes.some((prefix) => normalized.includes(prefix));
}
function isHeavyAgentModel(model) {
  return matchesModelPrefix(model, HEAVY_AGENT_BETA_MODEL_PREFIXES);
}
function isContext1mModel(model) {
  return matchesModelPrefix(model, CONTEXT_1M_BETA_MODEL_PREFIXES) && !matchesModelPrefix(model, CONTEXT_1M_NATIVE_MODEL_PREFIXES);
}
function shouldUseMidConversationSystem(body, model) {
  const payload = body || {};
  const hasSystem = !!payload.system && (typeof payload.system === "string" || Array.isArray(payload.system) && payload.system.length > 0);
  const hasTools = Array.isArray(payload.tools) && payload.tools.length > 0;
  const effectiveModel = model ?? (typeof payload.model === "string" ? payload.model : "");
  return hasSystem && hasTools && matchesModelPrefix(effectiveModel, CONTEXT_1M_BETA_MODEL_PREFIXES);
}
function selectBetaFlags(body, model, clientBeta) {
  const b = body || {};
  const clientBetaSet = typeof clientBeta === "string" && clientBeta.trim().length > 0 ? new Set(
    clientBeta.split(",").map((f) => f.trim()).filter(Boolean)
  ) : null;
  const allowThinking = clientBetaSet === null || clientBetaSet.has("interleaved-thinking-2025-05-14");
  const allowHeavy = clientBetaSet === null || clientBetaSet.has("advanced-tool-use-2025-11-20");
  const hasSystem = !!b.system && (typeof b.system === "string" || Array.isArray(b.system) && b.system.length > 0);
  const tools = b.tools;
  const hasTools = Array.isArray(tools) && tools.length > 0;
  const outputCfg = b.output_config;
  const hasStructuredOutput = !!(outputCfg && outputCfg.format?.type === "json_schema") || !!b.response_format?.type;
  const isFullAgent = hasTools && hasSystem;
  const effectiveModel = model ?? (typeof b.model === "string" ? b.model : "");
  const isHeavyAgent = isFullAgent && isHeavyAgentModel(effectiveModel);
  const isOpusAgent = shouldUseMidConversationSystem(b, effectiveModel);
  const isContext1m = isFullAgent && isContext1mModel(effectiveModel);
  const flags = [];
  if (isFullAgent) flags.push("claude-code-20250219");
  flags.push("oauth-2025-04-20");
  if (isContext1m) flags.push("context-1m-2025-08-07");
  if (isOpusAgent) flags.push("mid-conversation-system-2026-04-07");
  if (allowThinking) {
    flags.push(
      "interleaved-thinking-2025-05-14",
      "redact-thinking-2026-02-12",
      "thinking-token-count-2026-05-13"
    );
  }
  flags.push("context-management-2025-06-27", "prompt-caching-scope-2026-01-05");
  if (hasStructuredOutput || isFullAgent) flags.push("advisor-tool-2026-03-01");
  if (hasStructuredOutput && !isFullAgent) flags.push("structured-outputs-2025-12-15");
  if (isFullAgent) {
    flags.push("extended-cache-ttl-2025-04-11", "cache-diagnosis-2026-04-07");
  }
  if (isHeavyAgent && allowHeavy) {
    flags.push("advanced-tool-use-2025-11-20", "effort-2025-11-24");
  }
  return flags.join(",");
}
const TOOL_PREFIX = "proxy_";
function stripProxyToolPrefix(body) {
  const stripName = (n) => {
    if (typeof n !== "string") return void 0;
    return n.startsWith(TOOL_PREFIX) ? n.slice(TOOL_PREFIX.length) : n;
  };
  const tools = body.tools;
  if (Array.isArray(tools)) {
    for (const t of tools) {
      const stripped = stripName(t.name);
      if (stripped !== void 0) t.name = stripped;
    }
  }
  const tc = body.tool_choice;
  if (tc && typeof tc.name === "string") {
    const stripped = stripName(tc.name);
    if (stripped !== void 0) tc.name = stripped;
  }
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const m of messages) {
      const content = m.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === "tool_use") {
          const stripped = stripName(block.name);
          if (stripped !== void 0) block.name = stripped;
        }
      }
    }
  }
}
export {
  CLAUDE_CODE_STAINLESS_VERSION,
  CLAUDE_CODE_VERSION,
  buildUserIdJson,
  fetchClaudeBootstrap,
  generateCliUserID,
  getSessionId,
  parseUpstreamMetadataUserId,
  passthroughUpstreamSessionId,
  resolveAccountUUID,
  resolveCliUserID,
  selectBetaFlags,
  shouldUseMidConversationSystem,
  stainlessArch,
  stainlessOS,
  stainlessRuntimeVersion,
  stripProxyToolPrefix,
  uuidV4FromHash
};
