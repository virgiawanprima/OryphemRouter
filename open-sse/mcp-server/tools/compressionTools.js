import { logToolCall } from "../audit.js";
import {
  getCompressionSettings,
  updateCompressionSettings
} from "../../utils/omni/dbCompression.js";
import { getCompressionAnalyticsSummary } from "../../utils/omni/dbCompressionAnalytics.js";
import { getCacheStatsSummary } from "../../utils/omni/dbCompressionCacheStats.js";
import { listCompressionCombos } from "../../utils/omni/dbCompressionCombos.js";
import {
  getMcpDescriptionCompressionStats,
  snapshotMcpDescriptionCompressionStats
} from "../descriptionCompressor.js";
async function handleCompressionStatus(args, extra) {
  const start = Date.now();
  try {
    const settings = await getCompressionSettings();
    await snapshotMcpDescriptionCompressionStats();
    const analyticsSummary = getCompressionAnalyticsSummary();
    const mcpDescriptionStats = getMcpDescriptionCompressionStats();
    const cacheStats = getCacheStatsSummary();
    const result = {
      enabled: settings.enabled,
      strategy: settings.defaultMode || "standard",
      settings: {
        maxTokens: settings.autoTriggerTokens,
        autoTriggerMode: settings.autoTriggerMode ?? "lite",
        targetRatio: 0.7,
        // Default target ratio
        preserveSystemPrompt: settings.preserveSystemPrompt,
        mcpDescriptionCompressionEnabled: settings.mcpDescriptionCompressionEnabled !== false
      },
      analytics: {
        totalRequests: analyticsSummary.totalRequests,
        compressedRequests: Object.values(analyticsSummary.byMode ?? {}).reduce(
          (sum, mode) => sum + mode.count,
          0
        ),
        tokensSaved: analyticsSummary.totalTokensSaved,
        avgCompressionRatio: analyticsSummary.avgSavingsPct,
        byMode: analyticsSummary.byMode ?? {},
        byEngine: analyticsSummary.byEngine ?? {},
        byCompressionCombo: analyticsSummary.byCompressionCombo ?? {},
        validationFallbacks: analyticsSummary.validationFallbacks,
        requestsWithReceipts: analyticsSummary.realUsage.requestsWithReceipts,
        realUsage: analyticsSummary.realUsage,
        mcpDescriptionCompression: {
          descriptionsCompressed: mcpDescriptionStats.descriptionsCompressed,
          charsBefore: mcpDescriptionStats.charsBefore,
          charsAfter: mcpDescriptionStats.charsAfter,
          charsSaved: mcpDescriptionStats.charsSaved,
          estimatedTokensSaved: mcpDescriptionStats.estimatedTokensSaved,
          persistedEstimatedTokensSaved: analyticsSummary.mcpDescriptionCompression.estimatedTokensSaved,
          persistedSnapshots: analyticsSummary.mcpDescriptionCompression.snapshots,
          source: "mcp_metadata_estimate",
          notProviderUsage: true
        }
      },
      cacheStats: cacheStats ? {
        hits: Math.round(cacheStats.cacheHitRate * (cacheStats.totalRequests || 1)),
        misses: Math.round((1 - cacheStats.cacheHitRate) * (cacheStats.totalRequests || 1)),
        hitRate: `${(cacheStats.cacheHitRate * 100).toFixed(2)}%`,
        tokensSaved: Math.round(cacheStats.avgNetSavings)
      } : null
    };
    const duration = Date.now() - start;
    await logToolCall("omniroute_compression_status", args, result, duration, true);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToolCall(
      "omniroute_compression_status",
      args,
      { error: errorMessage },
      duration,
      false,
      "ERROR"
    );
    throw error;
  }
}
async function handleCompressionConfigure(args, extra) {
  const start = Date.now();
  try {
    const updates = {};
    if (args.enabled !== void 0) {
      updates.enabled = args.enabled;
    }
    if (args.strategy !== void 0) {
      updates.defaultMode = args.strategy;
    }
    if (args.autoTriggerMode !== void 0) {
      updates.autoTriggerMode = args.autoTriggerMode;
    }
    if (args.maxTokens !== void 0) {
      updates.autoTriggerTokens = args.maxTokens;
    }
    if (args.preserveSystemPrompt !== void 0) {
      updates.preserveSystemPrompt = args.preserveSystemPrompt;
    }
    if (args.mcpDescriptionCompressionEnabled !== void 0) {
      updates.mcpDescriptionCompressionEnabled = args.mcpDescriptionCompressionEnabled;
    }
    const settings = await updateCompressionSettings(updates);
    const result = {
      success: true,
      updated: updates,
      settings: {
        enabled: settings.enabled,
        strategy: settings.defaultMode || "standard",
        autoTriggerMode: settings.autoTriggerMode ?? "lite",
        maxTokens: settings.autoTriggerTokens,
        targetRatio: 0.7,
        // Default target ratio
        preserveSystemPrompt: settings.preserveSystemPrompt,
        mcpDescriptionCompressionEnabled: settings.mcpDescriptionCompressionEnabled !== false
      }
    };
    const duration = Date.now() - start;
    await logToolCall("omniroute_compression_configure", args, result, duration, true);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToolCall(
      "omniroute_compression_configure",
      args,
      { error: errorMessage },
      duration,
      false,
      "ERROR"
    );
    throw error;
  }
}
import { z } from "zod";
import {
  compressionStatusInput,
  compressionConfigureInput,
  setCompressionEngineInput,
  listCompressionCombosInput,
  compressionComboStatsInput,
  ccrStoreInput,
  ccrRetrieveInput,
  ccrInspectInput,
  ccrListInput,
  ccrDeleteInput,
  ccrStatsInput
} from "../schemas/tools.js";
import {
  MAX_CCR_MCP_FULL_BYTES,
  buildCcrReference,
  deleteCcrBlock,
  getCcrStoreStats,
  handleCcrRetrieve,
  inspectCcrBlock,
  isCcrStoreRejection,
  listCcrBlocks,
  tryStoreBlock
} from "../../utils/omni/ccrEngine.js";
import {
  listRtkCommandSamples,
  discoverRepeatedNoise,
  suggestFilter,
  commandToId
} from "../../utils/omni/rtkEngine.js";
import { resolveCallerScopeContext } from "../scopeEnforcement.js";
import { resolveMcpCallerApiKeyId } from "../mcpCallerIdentity.js";
async function resolveCcrPrincipal(extra, scopes) {
  const apiKeyPrincipal = await resolveMcpCallerApiKeyId();
  if (apiKeyPrincipal) return apiKeyPrincipal;
  const { callerId } = resolveCallerScopeContext(extra, scopes);
  return callerId === "anonymous" ? void 0 : callerId;
}
function buildCcrStoreAuditInput(args) {
  return {
    bytes: Buffer.byteLength(args.content, "utf8"),
    contentType: args.contentType,
    ttlSeconds: args.ttlSeconds
  };
}
async function handleCcrStoreTool(args, extra) {
  const start = Date.now();
  const principal = await resolveCcrPrincipal(extra, ["write:compression"]);
  const result = tryStoreBlock(args.content, principal, {
    contentType: args.contentType,
    source: "mcp",
    ttlSeconds: args.ttlSeconds
  });
  const auditInput = buildCcrStoreAuditInput(args);
  if (isCcrStoreRejection(result)) {
    const output2 = { stored: false, reason: result.reason };
    await logToolCall(
      "omniroute_ccr_store",
      auditInput,
      output2,
      Date.now() - start,
      false,
      result.reason
    );
    return output2;
  }
  const output = {
    stored: true,
    reference: buildCcrReference(result.hash, result.metadata.chars),
    metadata: result.metadata
  };
  await logToolCall("omniroute_ccr_store", auditInput, output, Date.now() - start, true);
  return output;
}
async function handleCcrRetrieveTool(args, extra) {
  const start = Date.now();
  const principal = await resolveCcrPrincipal(extra, ["read:compression"]);
  const metadata = inspectCcrBlock(args.hash, principal);
  if (!metadata) {
    const output2 = { found: false, error: "CCR block not found or expired" };
    await logToolCall(
      "omniroute_ccr_retrieve",
      args,
      output2,
      Date.now() - start,
      false,
      "NOT_FOUND"
    );
    return output2;
  }
  if ((!args.mode || args.mode === "full") && metadata.bytes > MAX_CCR_MCP_FULL_BYTES) {
    const output2 = {
      found: true,
      tooLargeForFull: true,
      metadata,
      suggestedModes: ["head", "tail", "lines", "grep", "stats"]
    };
    await logToolCall("omniroute_ccr_retrieve", args, output2, Date.now() - start, true);
    return output2;
  }
  const queried = handleCcrRetrieve(args, principal);
  const refreshedMetadata = inspectCcrBlock(args.hash, principal) ?? metadata;
  const output = "content" in queried ? { found: true, metadata: refreshedMetadata, content: queried.content } : { found: true, metadata: refreshedMetadata, error: queried.error };
  await logToolCall(
    "omniroute_ccr_retrieve",
    args,
    {
      ...output,
      ...typeof output.content === "string" ? { content: `[${Buffer.byteLength(output.content, "utf8")} bytes]` } : {}
    },
    Date.now() - start,
    !("error" in output),
    "error" in output ? "INVALID_QUERY" : void 0
  );
  return output;
}
async function handleCcrInspectTool(args, extra) {
  const start = Date.now();
  const principal = await resolveCcrPrincipal(extra, ["read:compression"]);
  const metadata = inspectCcrBlock(args.hash, principal);
  const output = metadata ? { found: true, reference: buildCcrReference(args.hash, metadata.chars), metadata } : { found: false };
  await logToolCall("omniroute_ccr_inspect", args, output, Date.now() - start, Boolean(metadata));
  return output;
}
async function handleCcrListTool(args, extra) {
  const start = Date.now();
  const principal = await resolveCcrPrincipal(extra, ["read:compression"]);
  const result = listCcrBlocks(principal, args);
  const output = {
    ...result,
    entries: result.entries.map((metadata) => ({
      reference: buildCcrReference(metadata.hash, metadata.chars),
      metadata
    }))
  };
  await logToolCall("omniroute_ccr_list", args, output, Date.now() - start, true);
  return output;
}
async function handleCcrDeleteTool(args, extra) {
  const start = Date.now();
  const principal = await resolveCcrPrincipal(extra, ["write:compression"]);
  const output = { deleted: deleteCcrBlock(args.hash, principal) };
  await logToolCall("omniroute_ccr_delete", args, output, Date.now() - start, true);
  return output;
}
async function handleCcrStatsTool(args, extra) {
  const start = Date.now();
  const principal = await resolveCcrPrincipal(extra, ["read:compression"]);
  const output = getCcrStoreStats(principal);
  await logToolCall("omniroute_ccr_stats", args, output, Date.now() - start, true);
  return output;
}
async function handleSetCompressionEngine(args) {
  const updates = { enabled: true };
  const current = await getCompressionSettings();
  if (args.engine) {
    updates.defaultMode = args.engine === "caveman" ? "standard" : args.engine;
    if (args.engine === "off") {
      updates.enabled = false;
    } else if (args.engine !== "stacked") {
      const selectedEngine = args.engine === "caveman" ? "caveman" : args.engine;
      updates.engines = Object.fromEntries(
        Object.entries(current.engines).map(([id, toggle]) => [
          id,
          {
            ...toggle,
            enabled: id === selectedEngine,
            ...id === "caveman" && args.cavemanIntensity ? { level: args.cavemanIntensity } : {},
            ...id === "rtk" && args.rtkIntensity ? { level: args.rtkIntensity } : {}
          }
        ])
      );
    }
  }
  if (args.cavemanIntensity) {
    updates.cavemanConfig = {
      ...current.cavemanConfig ?? {},
      intensity: args.cavemanIntensity
    };
  }
  if (args.rtkIntensity) {
    updates.rtkConfig = {
      ...current.rtkConfig ?? {},
      intensity: args.rtkIntensity
    };
  }
  if (args.outputMode !== void 0) {
    updates.cavemanOutputMode = {
      ...current.cavemanOutputMode ?? {},
      enabled: args.outputMode
    };
  }
  const settings = await updateCompressionSettings(updates);
  return { success: true, settings };
}
async function handleListCompressionCombos() {
  return { combos: listCompressionCombos() };
}
async function handleCompressionComboStats(args) {
  const summary = getCompressionAnalyticsSummary(args.since === "all" ? void 0 : args.since);
  if (!args.comboId) return summary;
  return {
    comboId: args.comboId,
    summary,
    combo: summary.byCompressionCombo[args.comboId] ?? { count: 0, tokensSaved: 0 }
  };
}
const rtkDiscoverInput = z.object({
  limit: z.number().int().positive().max(2e3).optional().describe("Max samples to scan (default 500)")
});
const rtkLearnInput = z.object({
  command: z.string().min(1).max(500).describe("The command to learn an RTK filter draft for"),
  limit: z.number().int().positive().max(2e3).optional().describe("Max samples to scan (default 500)")
});
function resolveSampleLimit(limit) {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return 500;
  return Math.min(2e3, Math.floor(limit));
}
async function handleRtkDiscover(args) {
  const start = Date.now();
  const samples = listRtkCommandSamples({ limit: resolveSampleLimit(args.limit) });
  const candidates = discoverRepeatedNoise(samples);
  const result = { sampleCount: samples.length, candidates };
  await logToolCall("omniroute_rtk_discover", args, result, Date.now() - start, true);
  return result;
}
async function handleRtkLearn(args) {
  const start = Date.now();
  const command = args.command.trim();
  const targetId = commandToId(command);
  const matching = listRtkCommandSamples({ limit: resolveSampleLimit(args.limit) }).filter(
    (sample) => commandToId(sample.command) === targetId
  );
  const filter = suggestFilter(command, matching);
  const result = { command, sampleCount: matching.length, filter };
  await logToolCall("omniroute_rtk_learn", args, result, Date.now() - start, true);
  return result;
}
const compressionTools = {
  omniroute_compression_status: {
    name: "omniroute_compression_status",
    description: "Returns current compression configuration, strategy, analytics summary (requests compressed, tokens saved, avg ratio), and provider-aware cache statistics.",
    scopes: ["read:compression"],
    inputSchema: compressionStatusInput,
    handler: (args) => handleCompressionStatus(args)
  },
  omniroute_compression_configure: {
    name: "omniroute_compression_configure",
    description: "Configure compression settings at runtime. Supports enabling/disabling compression, changing strategy (off/lite/standard/aggressive/ultra/rtk/stacked), adjusting maxTokens threshold, targetRatio, auto-trigger mode, system prompt preservation, and MCP description compression.",
    scopes: ["write:compression"],
    inputSchema: compressionConfigureInput,
    handler: (args) => handleCompressionConfigure(args)
  },
  omniroute_set_compression_engine: {
    name: "omniroute_set_compression_engine",
    description: "Set the active compression engine and Caveman/RTK runtime options.",
    scopes: ["write:compression"],
    inputSchema: setCompressionEngineInput,
    handler: (args) => handleSetCompressionEngine(args)
  },
  omniroute_list_compression_combos: {
    name: "omniroute_list_compression_combos",
    description: "List compression combos and their engine pipelines.",
    scopes: ["read:compression"],
    inputSchema: listCompressionCombosInput,
    handler: (_args) => handleListCompressionCombos()
  },
  omniroute_compression_combo_stats: {
    name: "omniroute_compression_combo_stats",
    description: "Get compression analytics grouped by engine and compression combo.",
    scopes: ["read:compression"],
    inputSchema: compressionComboStatsInput,
    handler: (args) => handleCompressionComboStats(args)
  },
  omniroute_ccr_store: {
    name: "omniroute_ccr_store",
    description: "Store verbatim content in the caller-isolated in-memory CCR store and return a ccr:// reference plus the compatible CCR marker. Entries expire automatically and are not persisted across restarts.",
    scopes: ["write:compression"],
    inputSchema: ccrStoreInput,
    handler: handleCcrStoreTool
  },
  omniroute_ccr_retrieve: {
    name: "omniroute_ccr_retrieve",
    description: "Retrieve the verbatim content block stored by the CCR compression engine. When a large block is compressed, a marker `[CCR retrieve hash=<24hex> chars=N]` is inserted. Pass the hash from the marker to this tool to get the original text back. Optional `mode` (head/tail/lines/grep/stats) retrieves a slice or summary instead of the whole block; omit for the full block. Scope: read:compression. Always available (sticky-on).",
    scopes: ["read:compression"],
    inputSchema: ccrRetrieveInput,
    handler: handleCcrRetrieveTool
  },
  omniroute_ccr_inspect: {
    name: "omniroute_ccr_inspect",
    description: "Inspect metadata for a caller-owned CCR block without returning its content.",
    scopes: ["read:compression"],
    inputSchema: ccrInspectInput,
    handler: handleCcrInspectTool
  },
  omniroute_ccr_list: {
    name: "omniroute_ccr_list",
    description: "List paginated metadata for CCR blocks owned by the current caller.",
    scopes: ["read:compression"],
    inputSchema: ccrListInput,
    handler: handleCcrListTool
  },
  omniroute_ccr_delete: {
    name: "omniroute_ccr_delete",
    description: "Delete a caller-owned block from the in-memory CCR store.",
    scopes: ["write:compression"],
    inputSchema: ccrDeleteInput,
    handler: handleCcrDeleteTool
  },
  omniroute_ccr_stats: {
    name: "omniroute_ccr_stats",
    description: "Return caller-scoped CCR entry and byte usage, lifecycle counters, and in-memory store limits.",
    scopes: ["read:compression"],
    inputSchema: ccrStatsInput,
    handler: handleCcrStatsTool
  },
  omniroute_rtk_discover: {
    name: "omniroute_rtk_discover",
    description: "Mine the opt-in RTK raw-output sample store for recurring noise lines and return them as ranked candidates the operator can turn into strip/collapse filters. Read-only; suggestions only. Scope: read:compression.",
    scopes: ["read:compression"],
    inputSchema: rtkDiscoverInput,
    handler: (args) => handleRtkDiscover(args)
  },
  omniroute_rtk_learn: {
    name: "omniroute_rtk_learn",
    description: "Suggest an RTK filter draft for a specific command, learned from that command's captured outputs in the opt-in raw-output sample store. Read-only; returns a draft for the operator to review and save. Scope: read:compression.",
    scopes: ["read:compression"],
    inputSchema: rtkLearnInput,
    handler: (args) => handleRtkLearn(args)
  }
};
export {
  buildCcrStoreAuditInput,
  compressionTools,
  handleCcrDeleteTool,
  handleCcrInspectTool,
  handleCcrListTool,
  handleCcrRetrieveTool,
  handleCcrStatsTool,
  handleCcrStoreTool,
  handleCompressionComboStats,
  handleCompressionConfigure,
  handleCompressionStatus,
  handleListCompressionCombos,
  handleRtkDiscover,
  handleRtkLearn,
  handleSetCompressionEngine
};
