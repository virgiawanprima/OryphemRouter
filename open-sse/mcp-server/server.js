import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getComboModelProvider,
  getComboModelString,
  getComboStepTarget
} from "../utils/omni/combosSteps.js";
import { registerToolSearchTool } from "./toolSearch/register.js";
import { log as engineLog, sanitize } from "../utils/log.js";
import {
  MCP_TOOLS,
  getHealthInput,
  listCombosInput,
  getComboMetricsInput,
  switchComboInput,
  createComboInput,
  checkQuotaInput,
  routeRequestInput,
  costReportInput,
  listModelsCatalogInput,
  buildWebSearchInputSchema,
  xSearchInput,
  webFetchInput,
  simulateRouteInput,
  setBudgetGuardInput,
  setRoutingStrategyInput,
  setResilienceProfileInput,
  testComboInput,
  getProviderMetricsInput,
  bestComboForTaskInput,
  explainRouteInput,
  pickFastestModelInput,
  getSessionSnapshotInput,
  dbHealthCheckInput,
  syncPricingInput,
  cacheStatsInput,
  cacheFlushInput,
  oneproxyFetchInput,
  oneproxyRotateInput,
  oneproxyStatsInput
} from "./schemas/tools.js";
import { startMcpHeartbeat } from "./runtimeHeartbeat.js";
import { countUniqueMcpTools } from "./toolCount.js";
import { z } from "zod";
import { closeAuditDb, logToolCall } from "./audit.js";
import {
  evaluateToolScopes,
  resolveCallerScopeContext
} from "./scopeEnforcement.js";
import { getMcpHttpAuthHeadersForInternalFetch } from "./httpAuthContext.js";
import { getInternalServiceAuthHeaders } from "../utils/omni/internalServiceAuth.js";
import {
  handleSimulateRoute,
  handleSetBudgetGuard,
  handleSetRoutingStrategy,
  handleSetResilienceProfile,
  handleTestCombo,
  handleGetProviderMetrics,
  handleBestComboForTask,
  handleExplainRoute,
  handleGetSessionSnapshot,
  handleDbHealthCheck,
  handleSyncPricing,
  handleCacheStats,
  handleCacheFlush,
  handleOneproxyFetch,
  handleOneproxyRotate,
  handleOneproxyStats
} from "./tools/advancedTools.js";
import { handlePickFastestModel } from "./tools/pickFastestModel.js";
import { memoryTools } from "./tools/memoryTools.js";
import { skillTools } from "./tools/skillTools.js";
import { agentSkillTools } from "./tools/agentSkillTools.js";
import { githubSkillTools } from "./tools/githubSkillTools.js";
import { skillRegistry } from "../utils/omni/skillsRegistry.js";
import { skillExecutor } from "../utils/omni/skillsExecutor.js";
import { pluginTools } from "./tools/pluginTools.js";
import { compressionTools } from "./tools/compressionTools.js";
import { poolTools } from "./tools/poolTools.js";
import { gamificationTools } from "./tools/gamificationTools.js";
import { notionTools } from "./tools/notionTools.js";
import { obsidianTools } from "./tools/obsidianTools.js";
import { localCorpusTools } from "./tools/localCorpusTools.js";
import { compressMcpRegistryMetadata } from "./descriptionCompressor.js";
import { reduceToolManifest, readMcpToolProfileFromEnv } from "./toolCardinality.js";
import { smartFilterText } from "../utils/omni/compressionMcpAccessibility.js";
import {
  DEFAULT_MCP_ACCESSIBILITY_CONFIG,
  clampMcpAccessibilityConfig
} from "../utils/omni/compressionMcpAccessibilityConstants.js";
import { getDbInstance } from "../utils/omni/dbCore.js";
import { normalizeQuotaResponse } from "../utils/omni/quotaContracts.js";
import { resolveOmniRouteBaseUrl } from "../utils/omni/resolveOmniRouteBaseUrl.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { mcpFetchTimeoutSignal } from "./fetchTimeout.js";
import { getMcpModelsCatalog } from "./catalog.js";
import { registerRadarCatalogTool } from "./radarCatalog.js";
import { getMcpModelsCatalog as getMcpModelsCatalog2 } from "./catalog.js";
const OMNIROUTE_BASE_URL = resolveOmniRouteBaseUrl();
const MCP_ENFORCE_SCOPES = process.env.OMNIROUTE_MCP_ENFORCE_SCOPES === "true";
const MCP_ALLOWED_SCOPES = new Set(
  (process.env.OMNIROUTE_MCP_SCOPES || "").split(",").map((s) => s.trim()).filter(Boolean)
);
const TOTAL_MCP_TOOL_COUNT = countUniqueMcpTools({
  MCP_TOOLS,
  memoryTools,
  skillTools,
  agentSkillTools,
  githubSkillTools,
  poolTools,
  gamificationTools,
  pluginTools,
  notionTools,
  obsidianTools,
  localCorpusTools,
  compressionTools
});
function readMcpDescriptionCompressionEnabled() {
  try {
    const row = getDbInstance().prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?").get("compression", "mcpDescriptionCompressionEnabled");
    if (!row?.value) return true;
    return JSON.parse(row.value) !== false;
  } catch {
    return true;
  }
}
function readMcpAccessibilityConfig() {
  try {
    const row = getDbInstance().prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?").get("compression", "mcpAccessibility");
    if (!row?.value) return { ...DEFAULT_MCP_ACCESSIBILITY_CONFIG };
    return clampMcpAccessibilityConfig(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_MCP_ACCESSIBILITY_CONFIG };
  }
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toArray(value) {
  return Array.isArray(value) ? value : [];
}
function toString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function toNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function isLaneFlagOn(value) {
  return value === true || value === "1" || value === "true";
}
function toStringArray(value, fallback = []) {
  const values = toArray(value).filter((entry) => typeof entry === "string");
  return values.length > 0 ? values : fallback;
}
function normalizeComboModels(rawModels) {
  return toArray(rawModels).map((rawModel, index) => {
    const modelRecord = toRecord(rawModel);
    const modelString = getComboModelString(rawModel);
    const target = getComboStepTarget(rawModel);
    const provider = getComboModelProvider(rawModel) || (modelString ? "unknown" : target ? "combo" : toString(modelRecord.provider, "unknown"));
    return {
      provider,
      model: modelString || target || toString(modelRecord.model, "unknown"),
      priority: toNumber(modelRecord.priority, index + 1)
    };
  });
}
function getOmniRouteApiKey() {
  return process.env.OMNIROUTE_API_KEY || "";
}
async function omniRouteFetch(path, options = {}) {
  const url = `${OMNIROUTE_BASE_URL}${path}`;
  const apiKey = getOmniRouteApiKey();
  const headers = {
    "Content-Type": "application/json",
    // Static env key is only a fallback; the per-caller MCP identity forwarded via
    // withMcpHttpAuthContext must win over it (#5819).
    ...apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    ...getMcpHttpAuthHeadersForInternalFetch(),
    ...options.headers || {},
    // Authenticate only the server-to-server hop. This does not replace or
    // weaken the caller identity forwarded above.
    ...getInternalServiceAuthHeaders()
  };
  const signal = options.signal || mcpFetchTimeoutSignal("management");
  const response = await fetch(url, { ...options, headers, signal });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`OmniRoute API error [${response.status}]: ${errorText}`);
  }
  return response.json();
}
function withScopeEnforcement(toolName, handler, toolScopes) {
  return async (args, extra) => {
    const scopeContext = resolveCallerScopeContext(extra, Array.from(MCP_ALLOWED_SCOPES));
    const scopeCheck = evaluateToolScopes(
      toolName,
      scopeContext.scopes,
      MCP_ENFORCE_SCOPES,
      toolScopes
    );
    if (!scopeCheck.allowed) {
      const missingScopes = scopeCheck.missing.length > 0 ? scopeCheck.missing.join(", ") : "unavailable";
      const reason = scopeCheck.reason || "scope_check_failed";
      const msg = `Insufficient MCP scopes for ${toolName}. Missing: ${missingScopes}. Caller=${scopeContext.callerId}, source=${scopeContext.source}.`;
      const safeArgs = args && typeof args === "object" ? toRecord(args) : { rawArgs: args };
      await logToolCall(
        toolName,
        {
          ...safeArgs,
          _scopeCheck: {
            callerId: scopeContext.callerId,
            source: scopeContext.source,
            required: scopeCheck.required,
            provided: scopeCheck.provided,
            missing: scopeCheck.missing
          }
        },
        null,
        0,
        false,
        `scope_denied:${reason}`
      );
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true
      };
    }
    return handler(args, extra);
  };
}
function toUptimeString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "unknown";
}
async function handleGetHealth() {
  const start = Date.now();
  try {
    const [healthRaw, resilienceRaw, rateLimitsRaw] = await Promise.allSettled([
      omniRouteFetch("/api/monitoring/health"),
      omniRouteFetch("/api/resilience"),
      omniRouteFetch("/api/rate-limits")
    ]);
    const health = healthRaw.status === "fulfilled" ? toRecord(healthRaw.value) : {};
    const resilience = resilienceRaw.status === "fulfilled" ? toRecord(resilienceRaw.value) : {};
    const rateLimits = rateLimitsRaw.status === "fulfilled" ? toRecord(rateLimitsRaw.value) : {};
    const memoryUsageRaw = toRecord(health.memoryUsage);
    const cacheStatsRaw = toRecord(health.cacheStats);
    const resilienceCircuitBreakers = toArray(resilience.circuitBreakers);
    const rateLimitEntries = toArray(rateLimits.limits);
    const adaptiveAdmissionRaw = toRecord(health.adaptiveAdmission);
    const laneTenants = toArray(adaptiveAdmissionRaw.laneTenants).map((tenant) => {
      const record = toRecord(tenant);
      return {
        tenantKey: toString(record.tenantKey),
        queuedCount: toNumber(record.queuedCount, 0),
        queuedCost: toNumber(record.queuedCost, 0)
      };
    }).sort((a, b) => b.queuedCost - a.queuedCost).slice(0, 10);
    const degradedSources = [
      { source: "health", settled: healthRaw },
      { source: "resilience", settled: resilienceRaw },
      { source: "rateLimits", settled: rateLimitsRaw }
    ];
    const degraded = degradedSources.filter(({ settled }) => settled.status === "rejected").map(({ source, settled }) => ({
      source,
      error: sanitizeErrorMessage(
        settled.status === "rejected" ? settled.reason : void 0
      )
    }));
    const result = {
      uptime: toUptimeString(health.uptime),
      version: toString(health.version, "unknown"),
      memoryUsage: {
        heapUsed: toNumber(memoryUsageRaw.heapUsed, 0),
        heapTotal: toNumber(memoryUsageRaw.heapTotal, 0)
      },
      circuitBreakers: resilienceCircuitBreakers,
      rateLimits: rateLimitEntries,
      cacheStats: Object.keys(cacheStatsRaw).length > 0 ? {
        hits: toNumber(cacheStatsRaw.hits, 0),
        misses: toNumber(cacheStatsRaw.misses, 0),
        hitRate: toNumber(cacheStatsRaw.hitRate, 0)
      } : void 0,
      cryptography: health.cryptography ? {
        status: toString(toRecord(health.cryptography).status, "missing_or_invalid"),
        provider: toString(toRecord(health.cryptography).provider, "unknown")
      } : void 0,
      adaptiveAdmission: Object.keys(adaptiveAdmissionRaw).length > 0 ? {
        virtualLanes: isLaneFlagOn(adaptiveAdmissionRaw.virtualLanes),
        pressure: toString(adaptiveAdmissionRaw.pressure),
        utilization: toNumber(adaptiveAdmissionRaw.utilization, 0),
        laneCount: toNumber(adaptiveAdmissionRaw.laneCount, 0),
        laneQueuedCount: toNumber(adaptiveAdmissionRaw.laneQueuedCount, 0),
        laneQueuedCost: toNumber(adaptiveAdmissionRaw.laneQueuedCost, 0),
        laneTenants,
        admittedCount: toNumber(adaptiveAdmissionRaw.admittedCount, 0),
        rejectedCount: toNumber(adaptiveAdmissionRaw.rejectedCount, 0),
        wouldRejectCount: toNumber(adaptiveAdmissionRaw.wouldRejectCount, 0),
        shutdown: isLaneFlagOn(adaptiveAdmissionRaw.shutdown)
      } : void 0,
      degraded: degraded.length > 0 ? degraded : void 0
    };
    await logToolCall("omniroute_get_health", {}, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_get_health", {}, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleListCombos(args) {
  const start = Date.now();
  try {
    const combosRaw = await omniRouteFetch("/api/combos");
    const combosRecord = toRecord(combosRaw);
    const combos = Array.isArray(combosRecord.combos) ? combosRecord.combos : Array.isArray(combosRaw) ? combosRaw : [];
    let metrics = {};
    if (args.includeMetrics) {
      metrics = toRecord(await omniRouteFetch("/api/combos/metrics").catch(() => ({})));
    }
    const result = {
      combos: toArray(combos).map((rawCombo) => {
        const combo = toRecord(rawCombo);
        const comboData = toRecord(combo.data);
        const comboId = toString(combo.id, "");
        const modelsSource = Array.isArray(combo.models) && combo.models.length > 0 ? combo.models : comboData.models;
        return {
          id: comboId,
          name: toString(combo.name, comboId || "unnamed"),
          models: normalizeComboModels(modelsSource),
          strategy: toString(combo.strategy, toString(comboData.strategy, "priority")),
          enabled: combo.enabled !== false,
          ...args.includeMetrics ? { metrics: metrics[comboId] ?? null } : {}
        };
      })
    };
    await logToolCall("omniroute_list_combos", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_list_combos", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleGetComboMetrics(args) {
  const start = Date.now();
  try {
    const result = await omniRouteFetch(
      `/api/combos/metrics?comboId=${encodeURIComponent(args.comboId)}`
    );
    await logToolCall("omniroute_get_combo_metrics", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_get_combo_metrics", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleSwitchCombo(args) {
  const start = Date.now();
  try {
    const result = await omniRouteFetch(`/api/combos/${encodeURIComponent(args.comboId)}`, {
      method: "PUT",
      body: JSON.stringify({ isActive: args.active })
    });
    await logToolCall("omniroute_switch_combo", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_switch_combo", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleCreateCombo(args) {
  const start = Date.now();
  try {
    const result = await omniRouteFetch("/api/combos", {
      method: "POST",
      body: JSON.stringify(args)
    });
    await logToolCall("omniroute_create_combo", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_create_combo", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleCheckQuota(args) {
  const start = Date.now();
  try {
    let path = "/api/usage/quota";
    if (args.connectionId) path += `?connectionId=${encodeURIComponent(args.connectionId)}`;
    else if (args.provider) path += `?provider=${encodeURIComponent(args.provider)}`;
    const result = normalizeQuotaResponse(await omniRouteFetch(path), {
      provider: args.provider || null,
      connectionId: args.connectionId || null
    });
    await logToolCall("omniroute_check_quota", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_check_quota", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleRouteRequest(args) {
  const start = Date.now();
  try {
    const body = {
      model: args.model,
      messages: args.messages,
      stream: false
      // MCP tool always returns non-streaming
    };
    if (args.combo) {
      body["x-combo"] = args.combo;
    }
    const raw = await omniRouteFetch("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
      // #9717: this hop waits on an upstream provider (and on auto-combo
      // candidate probing before one is even chosen), so it must not inherit
      // the management-read budget.
      signal: mcpFetchTimeoutSignal("upstream")
    });
    const choices = toArray(raw.choices);
    const firstChoice = toRecord(choices[0]);
    const firstMessage = toRecord(firstChoice.message);
    const usage = toRecord(raw.usage);
    const result = {
      response: {
        content: toString(firstMessage.content, ""),
        model: toString(raw.model, args.model),
        tokens: {
          prompt: toNumber(usage.prompt_tokens, 0),
          completion: toNumber(usage.completion_tokens, 0)
        }
      },
      routing: {
        provider: toString(raw.provider, "unknown"),
        combo: raw.combo ?? null,
        fallbacksTriggered: toNumber(raw.fallbacksTriggered, 0),
        cost: toNumber(raw.cost, 0),
        latencyMs: Date.now() - start,
        routingExplanation: toString(
          raw.routingExplanation,
          "Request routed through primary provider"
        )
      }
    };
    await logToolCall(
      "omniroute_route_request",
      { model: args.model, messageCount: args.messages.length },
      result.routing,
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall(
      "omniroute_route_request",
      { model: args.model },
      null,
      Date.now() - start,
      false,
      msg
    );
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleCostReport(args) {
  const start = Date.now();
  try {
    const period = args.period || "session";
    const rangeMap = {
      session: "1d",
      day: "1d",
      week: "7d",
      month: "30d"
    };
    const range = rangeMap[period] || "30d";
    const raw = toRecord(
      await omniRouteFetch(`/api/usage/analytics?range=${encodeURIComponent(range)}`)
    );
    const tokenCount = toRecord(raw.tokenCount);
    const budget = toRecord(raw.budget);
    const result = {
      period,
      totalCost: toNumber(raw.totalCost, 0),
      requestCount: toNumber(raw.requestCount, 0),
      tokenCount: {
        prompt: toNumber(tokenCount.prompt, 0),
        completion: toNumber(tokenCount.completion, 0)
      },
      byProvider: toArray(raw.byProvider),
      byModel: toArray(raw.byModel),
      budget: {
        limit: budget.limit ?? null,
        remaining: budget.remaining ?? null
      }
    };
    await logToolCall("omniroute_cost_report", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_cost_report", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleListModelsCatalog(args) {
  const start = Date.now();
  try {
    const result = await getMcpModelsCatalog(args);
    await logToolCall(
      "omniroute_list_models_catalog",
      args,
      { modelCount: result.models.length },
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_list_models_catalog", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleWebSearch(args) {
  const start = Date.now();
  try {
    const body = {
      query: args.query,
      max_results: args.max_results ?? 5,
      search_type: args.search_type ?? "web"
    };
    if (args.provider) body.provider = args.provider;
    const result = await omniRouteFetch("/v1/search", {
      method: "POST",
      body: JSON.stringify(body),
      signal: mcpFetchTimeoutSignal("upstream")
    });
    await logToolCall("omniroute_web_search", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_web_search", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleXSearch(args) {
  const start = Date.now();
  try {
    const result = await omniRouteFetch("/v1/search", {
      method: "POST",
      body: JSON.stringify({
        query: args.query,
        max_results: args.max_results ?? 5,
        search_type: "x",
        provider: "x-search"
      }),
      signal: AbortSignal.timeout(12e4)
    });
    await logToolCall("omniroute_x_search", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_x_search", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleWebFetch(args) {
  const start = Date.now();
  try {
    const body = {
      url: args.url,
      format: args.format ?? "markdown",
      include_metadata: args.include_metadata ?? false
    };
    if (args.provider) body.provider = args.provider;
    if (args.depth !== void 0) body.depth = args.depth;
    if (args.wait_for_selector) body.wait_for_selector = args.wait_for_selector;
    const result = await omniRouteFetch("/v1/web/fetch", {
      method: "POST",
      body: JSON.stringify(body),
      signal: mcpFetchTimeoutSignal("upstream")
    });
    await logToolCall("omniroute_web_fetch", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_web_fetch", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
function createMcpServer(options) {
  const resolveBlockedProviders = () => {
    if (typeof options?.blockedProviders === "function") {
      return options.blockedProviders();
    }
    if (Array.isArray(options?.blockedProviders)) {
      return options.blockedProviders;
    }
    return [];
  };
  const blockedProviders = resolveBlockedProviders();
  const dynamicWebSearchInput = buildWebSearchInputSchema(blockedProviders);
  const server = new McpServer({
    name: "omniroute",
    version: process.env.npm_package_version || "1.8.1"
  });
  const mcpDescriptionCompressionEnabled = readMcpDescriptionCompressionEnabled();
  const mcpAccessibilityConfig = readMcpAccessibilityConfig();
  const toolProfile = readMcpToolProfileFromEnv(process.env);
  const registerTool = server.registerTool.bind(server);
  server.registerTool = (name, config, handler) => {
    const metadata = compressMcpRegistryMetadata(config, {
      enabled: mcpDescriptionCompressionEnabled
    });
    const filteredHandler = mcpAccessibilityConfig.enabled ? async (args, extra) => {
      const result = await handler(
        args,
        extra
      );
      if (Array.isArray(result?.content)) {
        for (const block of result.content) {
          if (block && block.type === "text" && typeof block.text === "string") {
            block.text = smartFilterText(block.text, mcpAccessibilityConfig);
          }
        }
      }
      return result;
    } : handler;
    const registered = registerTool(name, metadata, filteredHandler);
    if (toolProfile && reduceToolManifest([{ name, scopes: [] }], toolProfile).length === 0) {
      const disablable = registered;
      if (typeof disablable?.disable === "function") disablable.disable();
    }
    return registered;
  };
  const registerPrompt = server.registerPrompt.bind(server);
  server.registerPrompt = (name, config, handler) => {
    const metadata = compressMcpRegistryMetadata(config, {
      enabled: mcpDescriptionCompressionEnabled
    });
    return registerPrompt(name, metadata, handler);
  };
  const registerResource = server.registerResource.bind(server);
  server.registerResource = (name, uriOrTemplate, config, readCallback) => {
    const metadata = compressMcpRegistryMetadata(config, {
      enabled: mcpDescriptionCompressionEnabled
    });
    return registerResource(name, uriOrTemplate, metadata, readCallback);
  };
  const RESERVED_MCP_NAMES = /* @__PURE__ */ new Set([
    ...MCP_TOOLS.map((t) => t.name),
    ...Object.keys(memoryTools),
    ...Object.keys(skillTools),
    ...Object.keys(compressionTools),
    ...Object.keys(poolTools),
    ...pluginTools.map((t) => t.name),
    ...gamificationTools.map((t) => t.name),
    ...obsidianTools.map((t) => t.name),
    ...notionTools.map((t) => t.name),
    ...localCorpusTools.map((t) => t.name)
  ]);
  server.registerTool(
    "omniroute_get_health",
    {
      description: "Returns OmniRoute health status including uptime, memory, circuit breakers, rate limits, and cache stats",
      inputSchema: getHealthInput
    },
    withScopeEnforcement("omniroute_get_health", async (args) => {
      getHealthInput.parse(args ?? {});
      return handleGetHealth();
    })
  );
  server.registerTool(
    "omniroute_list_combos",
    {
      description: "Lists all configured combos (model chains) with strategies and optional metrics",
      inputSchema: listCombosInput
    },
    withScopeEnforcement(
      "omniroute_list_combos",
      (args) => handleListCombos(listCombosInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_get_combo_metrics",
    {
      description: "Returns detailed performance metrics for a specific combo",
      inputSchema: getComboMetricsInput
    },
    withScopeEnforcement(
      "omniroute_get_combo_metrics",
      (args) => handleGetComboMetrics(getComboMetricsInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_switch_combo",
    {
      description: "Activates or deactivates a combo for routing",
      inputSchema: switchComboInput
    },
    withScopeEnforcement(
      "omniroute_switch_combo",
      (args) => handleSwitchCombo(switchComboInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_create_combo",
    {
      description: "Registers a new combo (model chain) with name, models, and strategy",
      inputSchema: createComboInput
    },
    withScopeEnforcement(
      "omniroute_create_combo",
      (args) => handleCreateCombo(createComboInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_check_quota",
    {
      description: "Checks remaining API quota for one or all providers",
      inputSchema: checkQuotaInput
    },
    withScopeEnforcement(
      "omniroute_check_quota",
      (args) => handleCheckQuota(checkQuotaInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_route_request",
    {
      description: "Sends a chat completion request through OmniRoute intelligent routing",
      inputSchema: routeRequestInput
    },
    withScopeEnforcement(
      "omniroute_route_request",
      (args) => handleRouteRequest(routeRequestInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_cost_report",
    {
      description: "Generates a cost report for the specified period",
      inputSchema: costReportInput
    },
    withScopeEnforcement(
      "omniroute_cost_report",
      (args) => handleCostReport(costReportInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_list_models_catalog",
    {
      description: "Lists all available AI models across providers with capabilities and pricing",
      inputSchema: listModelsCatalogInput
    },
    withScopeEnforcement(
      "omniroute_list_models_catalog",
      (args) => handleListModelsCatalog(listModelsCatalogInput.parse(args))
    )
  );
  registerRadarCatalogTool(server, withScopeEnforcement);
  server.registerTool(
    "omniroute_simulate_route",
    {
      description: "Simulates the routing path a request would take without executing it (dry-run)",
      inputSchema: simulateRouteInput
    },
    withScopeEnforcement(
      "omniroute_simulate_route",
      (args) => handleSimulateRoute(simulateRouteInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_set_budget_guard",
    {
      description: "Sets a session budget limit with configurable action when exceeded (degrade/block/alert)",
      inputSchema: setBudgetGuardInput
    },
    withScopeEnforcement(
      "omniroute_set_budget_guard",
      (args) => handleSetBudgetGuard(setBudgetGuardInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_set_routing_strategy",
    {
      description: "Updates combo routing strategy at runtime (priority/weighted/round-robin/auto/etc.)",
      inputSchema: setRoutingStrategyInput
    },
    withScopeEnforcement(
      "omniroute_set_routing_strategy",
      (args) => handleSetRoutingStrategy(setRoutingStrategyInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_set_resilience_profile",
    {
      description: "Applies a resilience profile controlling circuit breakers, retries, timeouts, and fallback depth",
      inputSchema: setResilienceProfileInput
    },
    withScopeEnforcement(
      "omniroute_set_resilience_profile",
      (args) => handleSetResilienceProfile(setResilienceProfileInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_test_combo",
    {
      description: "Tests each provider in a combo with a real prompt, reporting latency, cost, and success per provider",
      inputSchema: testComboInput
    },
    withScopeEnforcement(
      "omniroute_test_combo",
      (args) => handleTestCombo(testComboInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_get_provider_metrics",
    {
      description: "Returns detailed metrics for a specific provider including latency percentiles and circuit breaker state",
      inputSchema: getProviderMetricsInput
    },
    withScopeEnforcement(
      "omniroute_get_provider_metrics",
      (args) => handleGetProviderMetrics(getProviderMetricsInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_best_combo_for_task",
    {
      description: "Recommends the best combo for a task type based on provider fitness and constraints",
      inputSchema: bestComboForTaskInput
    },
    withScopeEnforcement(
      "omniroute_best_combo_for_task",
      (args) => handleBestComboForTask(bestComboForTaskInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_explain_route",
    {
      description: "Explains why a request was routed to a specific provider, showing scoring factors and fallbacks",
      inputSchema: explainRouteInput
    },
    withScopeEnforcement(
      "omniroute_explain_route",
      (args) => handleExplainRoute(explainRouteInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_pick_fastest_model",
    {
      description: "Picks the fastest reliable provider-model pair from live telemetry.",
      inputSchema: pickFastestModelInput
    },
    withScopeEnforcement(
      "omniroute_pick_fastest_model",
      (args) => handlePickFastestModel(pickFastestModelInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_get_session_snapshot",
    {
      description: "Returns a full snapshot of the current working session: cost, tokens, top models, errors, budget status",
      inputSchema: getSessionSnapshotInput
    },
    withScopeEnforcement("omniroute_get_session_snapshot", async (args) => {
      getSessionSnapshotInput.parse(args ?? {});
      return handleGetSessionSnapshot();
    })
  );
  server.registerTool(
    "omniroute_db_health_check",
    {
      description: "Diagnoses or repairs OmniRoute database drift, including broken combo references and orphan quota/domain rows",
      inputSchema: dbHealthCheckInput
    },
    withScopeEnforcement(
      "omniroute_db_health_check",
      (args) => handleDbHealthCheck(dbHealthCheckInput.parse(args ?? {}))
    )
  );
  server.registerTool(
    "omniroute_sync_pricing",
    {
      description: "Syncs pricing data from external sources (LiteLLM) into OmniRoute without overwriting user-set prices",
      inputSchema: syncPricingInput
    },
    withScopeEnforcement(
      "omniroute_sync_pricing",
      (args) => handleSyncPricing(syncPricingInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_web_search",
    {
      description: "Performs a web search using OmniRoute's search gateway. Supports multiple providers (Serper, Brave, Perplexity, Exa, Tavily) with automatic failover. Returns search results with titles, URLs, snippets, and position data.",
      inputSchema: dynamicWebSearchInput
    },
    withScopeEnforcement(
      "omniroute_web_search",
      (args) => (
        // Resolve per invocation (not the startup snapshot above) so a resolver
        // function passed via CreateMcpServerOptions sees policy changes without
        // a server rebuild. The advertised inputSchema stays a creation-time
        // snapshot — MCP clients fetch it once at tools/list.
        handleWebSearch(buildWebSearchInputSchema(resolveBlockedProviders()).parse(args))
      )
    )
  );
  server.registerTool(
    "omniroute_x_search",
    {
      description: "Search X (Twitter) through OmniRoute using SuperGrok / xAI server-side x_search. Requires xai-oauth or an xAI API key. Not web search.",
      inputSchema: xSearchInput
    },
    withScopeEnforcement("omniroute_x_search", (args) => handleXSearch(xSearchInput.parse(args)))
  );
  server.registerTool(
    "omniroute_web_fetch",
    {
      description: "Fetches and extracts content from a URL using OmniRoute's web fetch gateway. Supports multiple providers (Firecrawl, Jina Reader, Tavily) with automatic failover. Returns the page content as markdown, HTML, links, or screenshot, along with metadata.",
      inputSchema: webFetchInput
    },
    withScopeEnforcement("omniroute_web_fetch", (args) => handleWebFetch(webFetchInput.parse(args)))
  );
  server.registerTool(
    "omniroute_cache_stats",
    {
      description: "Returns cache statistics including semantic cache hit rate, prompt cache metrics by provider, and idempotency layer stats.",
      inputSchema: cacheStatsInput
    },
    withScopeEnforcement("omniroute_cache_stats", () => handleCacheStats())
  );
  server.registerTool(
    "omniroute_cache_flush",
    {
      description: "Flush cache entries. Provide signature to invalidate a single entry, model to invalidate all entries for a model, or omit both to clear all.",
      inputSchema: cacheFlushInput
    },
    withScopeEnforcement(
      "omniroute_cache_flush",
      (args) => handleCacheFlush(cacheFlushInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_oneproxy_fetch",
    {
      description: "Fetch free proxies from the 1proxy marketplace with optional filters for protocol, country, and quality. Returns validated proxies with quality scores.",
      inputSchema: oneproxyFetchInput
    },
    withScopeEnforcement(
      "omniroute_oneproxy_fetch",
      (args) => handleOneproxyFetch(oneproxyFetchInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_oneproxy_rotate",
    {
      description: "Get the next available free proxy from the 1proxy pool using the specified rotation strategy.",
      inputSchema: oneproxyRotateInput
    },
    withScopeEnforcement(
      "omniroute_oneproxy_rotate",
      (args) => handleOneproxyRotate(oneproxyRotateInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_oneproxy_stats",
    {
      description: "Returns 1proxy sync status and statistics: total proxies, average quality, sync history, and distribution by protocol and country.",
      inputSchema: oneproxyStatsInput
    },
    withScopeEnforcement(
      "omniroute_oneproxy_stats",
      (args) => handleOneproxyStats(oneproxyStatsInput.parse(args))
    )
  );
  registerToolSearchTool(server, withScopeEnforcement);
  Object.values(memoryTools).forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args, extra) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs, extra);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
          }
        },
        toolDef.scopes
      )
    );
  });
  Object.values(skillTools).forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args, extra) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs, extra);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
          }
        },
        toolDef.scopes
      )
    );
  });
  Object.values(agentSkillTools).forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(toolDef.name, async (args, extra) => {
        try {
          const parsedArgs = toolDef.inputSchema.parse(args ?? {});
          const result = await toolDef.handler(parsedArgs, extra);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
        }
      })
    );
  });
  Object.values(githubSkillTools).forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
          }
        },
        toolDef.scopes
      )
    );
  });
  pluginTools.forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args, extra) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs, extra);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
          }
        },
        toolDef.scopes
      )
    );
  });
  Object.values(compressionTools).forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args, extra) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs, extra);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
          }
        },
        toolDef.scopes
      )
    );
  });
  Object.values(poolTools).forEach(
    (toolDef) => {
      server.registerTool(
        toolDef.name,
        {
          description: toolDef.description,
          // @ts-ignore: dynamic zod access
          inputSchema: toolDef.inputSchema
        },
        withScopeEnforcement(
          toolDef.name,
          async (args, extra) => {
            try {
              const parsedArgs = toolDef.inputSchema.parse(args ?? {});
              const result = await toolDef.handler(parsedArgs, extra);
              return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
            }
          },
          toolDef.scopes
        )
      );
    }
  );
  gamificationTools.forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args, extra) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs, extra);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
          }
        },
        toolDef.scopes
      )
    );
  });
  notionTools.forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args, extra) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs, extra);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
          }
        },
        toolDef.scopes
      )
    );
  });
  localCorpusTools.forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args, extra) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs, extra);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return {
              content: [{ type: "text", text: `Error: ${sanitizeErrorMessage(error)}` }],
              isError: true
            };
          }
        },
        toolDef.scopes
      )
    );
  });
  obsidianTools.forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema
      },
      withScopeEnforcement(
        toolDef.name,
        async (args, extra) => {
          try {
            const parsedArgs = toolDef.inputSchema.parse(args ?? {});
            const result = await toolDef.handler(parsedArgs, extra);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
          }
        },
        toolDef.scopes
      )
    );
  });
  const skillToMcpToolName = (skill) => `skill_${skill.name.replace(/[^a-z0-9_-]/gi, "_")}`;
  try {
    const enabledSkills = skillRegistry.list().filter((s) => s.enabled);
    for (const skill of enabledSkills) {
      const toolName = skillToMcpToolName(skill);
      if (RESERVED_MCP_NAMES.has(toolName)) continue;
      server.registerTool(
        toolName,
        {
          description: skill.description,
          inputSchema: z.object({}).passthrough()
        },
        withScopeEnforcement(
          toolName,
          async (args, extra) => {
            const scopeContext = resolveCallerScopeContext(extra, Array.from(MCP_ALLOWED_SCOPES));
            const apiKeyId = scopeContext.callerId || "mcp";
            try {
              const execution = await skillExecutor.execute(
                skill.name,
                args ?? {},
                { apiKeyId }
              );
              return {
                content: [
                  { type: "text", text: JSON.stringify(execution.output, null, 2) }
                ]
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                content: [{ type: "text", text: `Error: ${msg}` }],
                isError: true
              };
            }
          },
          ["execute:skills"]
        )
      );
    }
  } catch {
  }
  return server;
}
async function startMcpStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  const version = process.env.npm_package_version || "1.8.1";
  const stopHeartbeat = startMcpHeartbeat({
    version,
    scopesEnforced: MCP_ENFORCE_SCOPES,
    allowedScopes: Array.from(MCP_ALLOWED_SCOPES),
    toolCount: TOTAL_MCP_TOOL_COUNT
  });
  const stopHeartbeatOnce = () => {
    stopHeartbeat();
  };
  process.once("exit", stopHeartbeatOnce);
  process.once("SIGINT", stopHeartbeatOnce);
  process.once("SIGTERM", stopHeartbeatOnce);
  engineLog.error("MCP", "OmniRoute MCP Server starting (stdio transport)...");
  try {
    await server.connect(transport);
    engineLog.error("MCP", "OmniRoute MCP Server connected and ready.");
  } finally {
    if (closeAuditDb()) {
      engineLog.error("MCP", "Audit database checkpointed and closed.");
    }
    stopHeartbeatOnce();
    process.off("exit", stopHeartbeatOnce);
    process.off("SIGINT", stopHeartbeatOnce);
    process.off("SIGTERM", stopHeartbeatOnce);
  }
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  startMcpStdio().catch((err) => {
    engineLog.error("MCP", "Fatal error:", sanitize(err));
    process.exit(1);
  });
}
export {
  createMcpServer,
  getMcpModelsCatalog2 as getMcpModelsCatalog,
  omniRouteFetch,
  startMcpStdio
};
