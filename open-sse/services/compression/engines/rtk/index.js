import { createCompressionStats, estimateCompressionTokens } from "../../stats.js";
import { DEFAULT_RTK_CONFIG } from "../../types.js";
import { detectCommandType } from "./commandDetector.js";
import { RTK_SCHEMA, validateRtkEngineConfig } from "./configSchema.js";
import { deduplicateRepeatedLines } from "./deduplicator.js";
import { groupSimilarLines } from "./grouper.js";
import { matchRtkFilter } from "./filterLoader.js";
import { applyLineFilter } from "./lineFilter.js";
import { smartTruncate } from "./smartTruncate.js";
import { normalizeCodeLanguage, stripCode } from "./codeStripper.js";
import {
  maybePersistRtkRawOutput,
  scheduleRtkRawOutputPurge
} from "./rawOutput.js";
import { applyRenderer } from "./renderers/index.js";
import { isTextBlock } from "../../messageContent.js";
import { adaptBodyForCompression } from "../../bodyAdapter.js";
import { isAnthropicToolResultBlock } from "../../toolResultCompressor.js";
const SHELL_TOOL_NAME_RE = /\b(bash|shell|terminal|run_command|execute_command|exec|command)\b/;
function hasCacheControlMarker(part) {
  return !!part && typeof part === "object" && part.cache_control !== void 0 && part.cache_control !== null;
}
function resolveToolMeta(toolId, lookup) {
  const meta = toolId ? lookup.get(toolId) : null;
  if (!meta) return { command: null, skipFilters: false };
  if (SHELL_TOOL_NAME_RE.test(meta.toolName.toLowerCase())) {
    return { command: meta.command, skipFilters: false };
  }
  return { command: null, skipFilters: true };
}
function mergeRtkConfig(base, override) {
  const merged = { ...DEFAULT_RTK_CONFIG, ...base ?? {}, ...override ?? {} };
  return {
    ...merged,
    intensity: merged.intensity === "minimal" || merged.intensity === "standard" || merged.intensity === "aggressive" ? merged.intensity : DEFAULT_RTK_CONFIG.intensity,
    enabledFilters: Array.isArray(merged.enabledFilters) ? merged.enabledFilters.filter((id) => typeof id === "string") : [],
    disabledFilters: Array.isArray(merged.disabledFilters) ? merged.disabledFilters.filter((id) => typeof id === "string") : [],
    maxLinesPerResult: typeof merged.maxLinesPerResult === "number" && Number.isFinite(merged.maxLinesPerResult) ? Math.max(0, Math.floor(merged.maxLinesPerResult)) : DEFAULT_RTK_CONFIG.maxLinesPerResult,
    maxCharsPerResult: typeof merged.maxCharsPerResult === "number" && Number.isFinite(merged.maxCharsPerResult) ? Math.max(0, Math.floor(merged.maxCharsPerResult)) : DEFAULT_RTK_CONFIG.maxCharsPerResult,
    deduplicateThreshold: typeof merged.deduplicateThreshold === "number" && Number.isFinite(merged.deduplicateThreshold) ? Math.max(2, Math.floor(merged.deduplicateThreshold)) : DEFAULT_RTK_CONFIG.deduplicateThreshold,
    customFiltersEnabled: typeof merged.customFiltersEnabled === "boolean" ? merged.customFiltersEnabled : DEFAULT_RTK_CONFIG.customFiltersEnabled,
    trustProjectFilters: typeof merged.trustProjectFilters === "boolean" ? merged.trustProjectFilters : DEFAULT_RTK_CONFIG.trustProjectFilters,
    rawOutputRetention: merged.rawOutputRetention === "never" || merged.rawOutputRetention === "failures" || merged.rawOutputRetention === "always" ? merged.rawOutputRetention : DEFAULT_RTK_CONFIG.rawOutputRetention,
    rawOutputMaxBytes: typeof merged.rawOutputMaxBytes === "number" && Number.isFinite(merged.rawOutputMaxBytes) ? Math.max(1024, Math.floor(merged.rawOutputMaxBytes)) : DEFAULT_RTK_CONFIG.rawOutputMaxBytes,
    rawOutputMaxFiles: typeof merged.rawOutputMaxFiles === "number" && Number.isFinite(merged.rawOutputMaxFiles) ? Math.max(1, Math.floor(merged.rawOutputMaxFiles)) : DEFAULT_RTK_CONFIG.rawOutputMaxFiles,
    rawOutputMaxAgeDays: typeof merged.rawOutputMaxAgeDays === "number" && Number.isFinite(merged.rawOutputMaxAgeDays) ? Math.max(1, Math.floor(merged.rawOutputMaxAgeDays)) : DEFAULT_RTK_CONFIG.rawOutputMaxAgeDays
  };
}
function shouldCompressMessage(message, config) {
  if (config.applyToToolResults && Array.isArray(message.content) && message.content.some(isAnthropicToolResultBlock))
    return true;
  if (message.role === "tool")
    return config.applyToToolResults || config.applyToCodeBlocks && hasCodeFence(message.content);
  if (message.role === "assistant")
    return config.applyToAssistantMessages || config.applyToCodeBlocks && hasCodeFence(message.content);
  return false;
}
function hasCodeFence(content) {
  if (!content) return false;
  if (typeof content === "string") return /```/.test(content);
  if (!Array.isArray(content)) return false;
  return content.some(
    (part) => isTextBlock(part) && typeof part.text === "string" && /```/.test(part.text)
  );
}
function codeOnlyConfig(config) {
  return config.applyToCodeBlocks && !config.applyToToolResults && !config.applyToAssistantMessages;
}
function processRtkCodeBlocksOnly(content, config) {
  const techniquesUsed = [];
  const rulesApplied = [];
  const rawOutputPointers = [];
  const processText = (text) => {
    let compressed2 = false;
    const nextText = text.replace(/```([\s\S]*?)```/g, (match) => {
      const processed = processRtkText(match, { config });
      techniquesUsed.push(...processed.techniquesUsed);
      rulesApplied.push(...processed.rulesApplied);
      if (processed.rawOutputPointers) rawOutputPointers.push(...processed.rawOutputPointers);
      if (!processed.compressed) return match;
      compressed2 = true;
      return processed.text;
    });
    return { text: compressed2 ? nextText : text, compressed: compressed2 };
  };
  if (typeof content === "string") {
    const processed = processText(content);
    return {
      content: processed.text,
      compressed: processed.compressed,
      techniquesUsed,
      rulesApplied,
      rawOutputPointers
    };
  }
  if (!Array.isArray(content)) {
    return { content, compressed: false, techniquesUsed, rulesApplied, rawOutputPointers };
  }
  let compressed = false;
  const nextContent = content.map((part) => {
    if (!isTextBlock(part) || !part.text) return part;
    const processed = processText(part.text);
    if (!processed.compressed) return part;
    compressed = true;
    return { ...part, text: processed.text };
  });
  return {
    content: compressed ? nextContent : content,
    compressed,
    techniquesUsed,
    rulesApplied,
    rawOutputPointers
  };
}
function processRtkText(text, options = {}) {
  const config = mergeRtkConfig(options.config);
  const originalTokens = estimateCompressionTokens(text);
  const techniquesUsed = [];
  const rulesApplied = [];
  const rawOutputPointers = [];
  let result = text;
  const detection = detectCommandType(text, options.command);
  const hasGenericErrorMarkers = /Error:|Exception:|Traceback \(most recent call last\):/.test(
    text
  );
  const isDocumentLikeRead = detection.type === "unknown" && !detection.command && !hasGenericErrorMarkers;
  let matchedFilterPatterns = [];
  if (!options.skipFilters && !isDocumentLikeRead) {
    const filter = matchRtkFilter(text, detection.command, {
      customFiltersEnabled: config.customFiltersEnabled,
      trustProjectFilters: config.trustProjectFilters
    });
    if (filter && !config.disabledFilters.includes(filter.id)) {
      if (config.enabledFilters.length === 0 || config.enabledFilters.includes(filter.id)) {
        const filtered = applyLineFilter(result, {
          ...filter,
          maxLines: effectiveMaxLines(filter.maxLines || config.maxLinesPerResult, config.intensity)
        });
        result = filtered.text;
        if (filtered.appliedRules.length > 0) {
          techniquesUsed.push("rtk-filter");
          rulesApplied.push(...filtered.appliedRules);
        }
        matchedFilterPatterns = filter.priorityPatterns;
      }
    }
  }
  if (config.enableRenderers) {
    try {
      const rendered = applyRenderer(result, detection, config);
      if (rendered.changed) {
        result = rendered.text;
        techniquesUsed.push(`rtk-render:${rendered.renderer}`);
        rulesApplied.push(`rtk:render:${rendered.renderer}`);
      }
    } catch {
    }
  }
  if (config.applyToCodeBlocks) {
    let strippedCodeBlocks = 0;
    result = result.replace(
      /```([A-Za-z0-9_+.-]*)\r?\n([\s\S]*?)```/g,
      (match, languageHint, code) => {
        const stripped = stripCode(code, normalizeCodeLanguage(languageHint), {
          // Opt-in comment removal (default off = no silent production change). Docstrings/JSDoc
          // are preserved unless explicitly disabled.
          removeComments: config.stripCodeComments === true,
          preserveDocstrings: config.preserveDocstrings !== false
        });
        if (stripped.strippedLines <= 0 && stripped.text === code.trim()) return match;
        strippedCodeBlocks++;
        const fenceLanguage = languageHint?.trim() || stripped.language;
        return `\`\`\`${fenceLanguage}
${stripped.text}
\`\`\``;
      }
    );
    if (strippedCodeBlocks > 0) {
      techniquesUsed.push("rtk-code-strip");
      rulesApplied.push("rtk:code-strip");
    }
  }
  const deduped = deduplicateRepeatedLines(result, { threshold: config.deduplicateThreshold });
  if (deduped.collapsed > 0) {
    result = deduped.text;
    techniquesUsed.push("rtk-dedup");
    rulesApplied.push("rtk:dedup");
  }
  if (config.enableGrouping) {
    const grouped = groupSimilarLines(result, {
      threshold: config.groupingThreshold
    });
    if (grouped.grouped > 0) {
      result = grouped.text;
      techniquesUsed.push("rtk-grouping");
      rulesApplied.push("rtk:grouping");
    }
  }
  const defaultPriorityPatterns = [/error|failed|exception|traceback|TS\d{4}|FAIL|✖/i];
  const filterPriorityPatterns = matchedFilterPatterns.flatMap((pattern) => {
    try {
      return [new RegExp(pattern, "i")];
    } catch {
      return [];
    }
  });
  const truncated = isDocumentLikeRead ? { text: result, truncated: false, droppedLines: 0 } : smartTruncate(result, {
    maxLines: effectiveMaxLines(config.maxLinesPerResult, config.intensity),
    maxChars: config.maxCharsPerResult,
    preserveHead: config.intensity === "aggressive" ? 16 : 24,
    preserveTail: config.intensity === "aggressive" ? 16 : 24,
    priorityPatterns: [...defaultPriorityPatterns, ...filterPriorityPatterns]
  });
  if (truncated.truncated) {
    result = truncated.text;
    techniquesUsed.push("rtk-truncate");
    rulesApplied.push("rtk:truncate");
  }
  const compressedTokens = estimateCompressionTokens(result);
  if (compressedTokens < originalTokens) {
    const pointer = maybePersistRtkRawOutput(text, {
      retention: config.rawOutputRetention,
      command: detection.command,
      maxBytes: config.rawOutputMaxBytes
    });
    if (pointer) {
      rawOutputPointers.push(pointer);
      techniquesUsed.push("rtk-raw-output-retention");
      rulesApplied.push("rtk:raw-output-retention");
    }
    if (config.rawOutputRetention !== "never") {
      scheduleRtkRawOutputPurge({
        maxFiles: config.rawOutputMaxFiles,
        maxAgeDays: config.rawOutputMaxAgeDays
      });
    }
  }
  return {
    text: result,
    compressed: compressedTokens < originalTokens,
    originalTokens,
    compressedTokens,
    techniquesUsed: [...new Set(techniquesUsed)],
    rulesApplied: [...new Set(rulesApplied)],
    ...rawOutputPointers.length > 0 ? { rawOutputPointers } : {}
  };
}
function processToolResultBlocks(content, config, toolCallLookup) {
  const techniquesUsed = [];
  const rulesApplied = [];
  const rawOutputPointers = [];
  if (!Array.isArray(content)) {
    return { content, compressed: false, techniquesUsed, rulesApplied, rawOutputPointers };
  }
  const collect = (processed) => {
    techniquesUsed.push(...processed.techniquesUsed);
    rulesApplied.push(...processed.rulesApplied);
    if (processed.rawOutputPointers) rawOutputPointers.push(...processed.rawOutputPointers);
  };
  let compressed = false;
  const nextContent = content.map((part) => {
    if (!isAnthropicToolResultBlock(part)) return part;
    if (hasCacheControlMarker(part)) return part;
    const toolUseId = typeof part.tool_use_id === "string" ? part.tool_use_id : null;
    const { command, skipFilters } = resolveToolMeta(toolUseId, toolCallLookup);
    const inner = part.content;
    if (typeof inner === "string") {
      if (!inner) return part;
      const processed = processRtkText(inner, { config, command, skipFilters });
      collect(processed);
      if (!processed.compressed) return part;
      compressed = true;
      return { ...part, content: processed.text };
    }
    if (Array.isArray(inner)) {
      let blockChanged = false;
      const nextInner = inner.map((sub) => {
        if (!isTextBlock(sub) || !sub.text) return sub;
        if (hasCacheControlMarker(sub)) return sub;
        const processed = processRtkText(sub.text, { config, command, skipFilters });
        collect(processed);
        if (!processed.compressed) return sub;
        blockChanged = true;
        compressed = true;
        return { ...sub, text: processed.text };
      });
      return blockChanged ? { ...part, content: nextInner } : part;
    }
    return part;
  });
  return {
    content: compressed ? nextContent : content,
    compressed,
    techniquesUsed,
    rulesApplied,
    rawOutputPointers
  };
}
function processRtkContent(content, config, options) {
  if (codeOnlyConfig(config)) {
    return processRtkCodeBlocksOnly(content, config);
  }
  const techniquesUsed = [];
  const rulesApplied = [];
  const rawOutputPointers = [];
  const collect = (processed) => {
    techniquesUsed.push(...processed.techniquesUsed);
    rulesApplied.push(...processed.rulesApplied);
    if (processed.rawOutputPointers) rawOutputPointers.push(...processed.rawOutputPointers);
  };
  if (typeof content === "string") {
    if (!content) {
      return { content, compressed: false, techniquesUsed, rulesApplied, rawOutputPointers };
    }
    const processed = processRtkText(content, {
      config,
      command: options?.command,
      skipFilters: options?.skipFilters
    });
    collect(processed);
    return {
      content: processed.compressed ? processed.text : content,
      compressed: processed.compressed,
      techniquesUsed,
      rulesApplied,
      rawOutputPointers
    };
  }
  if (!Array.isArray(content)) {
    return { content, compressed: false, techniquesUsed, rulesApplied, rawOutputPointers };
  }
  let compressed = false;
  const nextContent = content.map((part) => {
    if (!isTextBlock(part) || !part.text) return part;
    const processed = processRtkText(part.text, {
      config,
      command: options?.command,
      skipFilters: options?.skipFilters
    });
    collect(processed);
    if (!processed.compressed) return part;
    compressed = true;
    return { ...part, text: processed.text };
  });
  return {
    content: compressed ? nextContent : content,
    compressed,
    techniquesUsed,
    rulesApplied,
    rawOutputPointers
  };
}
function effectiveMaxLines(base, intensity) {
  const factor = intensity === "aggressive" ? 0.5 : intensity === "minimal" ? 1.5 : 1;
  return Math.max(1, Math.round(base * factor));
}
function applyRtkCompression(body, options = {}) {
  const start = performance.now();
  const stepConfig = options.stepConfig && options.stepConfig.enabled === void 0 ? { enabled: true, ...options.stepConfig } : options.stepConfig;
  const explicitConfig = options.config && Object.keys(options.config).length > 0;
  const baseConfig = !explicitConfig && !stepConfig ? { enabled: true } : options.config ?? {};
  const config = mergeRtkConfig(baseConfig, stepConfig);
  if (!config.enabled) return { body, compressed: false, stats: null };
  const adapter = adaptBodyForCompression(body);
  const messages = adapter.body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { body, compressed: false, stats: null };
  }
  const allTechniques = [];
  const allRules = [];
  const rawOutputPointers = [];
  const toolCallLookup = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const toolCalls = msg.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        if (!tc || typeof tc !== "object") continue;
        const id = typeof tc.id === "string" ? tc.id : null;
        if (!id) continue;
        const fn = tc.function;
        if (!fn || typeof fn !== "object") continue;
        const toolName = typeof fn.name === "string" ? fn.name : "";
        let command = null;
        if (typeof fn.arguments === "string") {
          try {
            const args = JSON.parse(fn.arguments);
            command = typeof args.command === "string" ? args.command : typeof args.cmd === "string" ? args.cmd : null;
          } catch {
          }
        }
        toolCallLookup.set(id, { toolName, command });
      }
    }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!part || typeof part !== "object" || part.type !== "tool_use") continue;
        const id = typeof part.id === "string" ? part.id : null;
        if (!id) continue;
        const toolName = typeof part.name === "string" ? part.name : "";
        const input = part.input;
        let command = null;
        if (input && typeof input === "object") {
          command = typeof input.command === "string" ? input.command : typeof input.cmd === "string" ? input.cmd : null;
        }
        toolCallLookup.set(id, { toolName, command });
      }
    }
  }
  const compressedMessages = messages.map((message) => {
    if (!shouldCompressMessage(message, config)) return message;
    if (Array.isArray(message.content) && message.content.some(isAnthropicToolResultBlock)) {
      const processed2 = processToolResultBlocks(message.content, config, toolCallLookup);
      allTechniques.push(...processed2.techniquesUsed);
      allRules.push(...processed2.rulesApplied);
      rawOutputPointers.push(...processed2.rawOutputPointers);
      if (!processed2.compressed) return message;
      return { ...message, content: processed2.content };
    }
    let command = null;
    let skipFilters = false;
    if (message.role === "tool") {
      const callId = typeof message.tool_call_id === "string" ? message.tool_call_id : null;
      ({ command, skipFilters } = resolveToolMeta(callId, toolCallLookup));
    }
    const processed = processRtkContent(message.content, config, { command, skipFilters });
    allTechniques.push(...processed.techniquesUsed);
    allRules.push(...processed.rulesApplied);
    rawOutputPointers.push(...processed.rawOutputPointers);
    if (!processed.compressed) return message;
    return {
      ...message,
      content: processed.content
    };
  });
  const anyMessageChanged = compressedMessages.some(
    (message, index) => message !== messages[index]
  );
  if (!anyMessageChanged) {
    return { body, compressed: false, stats: null };
  }
  const compressedBody = { ...adapter.body, messages: compressedMessages };
  const stats = createCompressionStats(
    adapter.body,
    compressedBody,
    "rtk",
    [...new Set(allTechniques)],
    allRules.length > 0 ? [...new Set(allRules)] : void 0,
    Math.round((performance.now() - start) * 100) / 100
  );
  stats.engine = "rtk";
  if (rawOutputPointers.length > 0) {
    stats.rtkRawOutputPointers = rawOutputPointers;
  }
  return {
    body: adapter.restore(compressedBody),
    compressed: stats.compressedTokens < stats.originalTokens,
    stats
  };
}
const rtkEngine = {
  id: "rtk",
  name: "RTK",
  description: "Command-aware tool output compression with declarative filters.",
  icon: "filter_alt",
  targets: ["tool_results", "code_blocks"],
  stackable: true,
  stackPriority: 10,
  metadata: {
    id: "rtk",
    name: "RTK",
    description: "Command-aware tool output compression with declarative filters.",
    inputScope: "tool-results",
    targetLatencyMs: 5,
    supportsPreview: true,
    stable: true
  },
  apply(body, options) {
    return applyRtkCompression(body, {
      config: options?.config?.rtkConfig,
      stepConfig: options?.stepConfig
    });
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config });
  },
  getConfigSchema() {
    return RTK_SCHEMA;
  },
  validateConfig(config) {
    return validateRtkEngineConfig(config);
  }
};
import {
  detectCommandFromText,
  detectCommandOutput,
  detectCommandType as detectCommandType2
} from "./commandDetector.js";
import { runRtkFilterTests } from "./verify.js";
import {
  maybePersistRtkRawOutput as maybePersistRtkRawOutput2,
  readRtkRawOutput,
  redactRtkRawOutput,
  listRtkCommandSamples
} from "./rawOutput.js";
import { discoverRepeatedNoise } from "./discover.js";
import { suggestFilter, commandToId } from "./learn.js";
export {
  applyRtkCompression,
  commandToId,
  detectCommandFromText,
  detectCommandOutput,
  detectCommandType2 as detectCommandType,
  discoverRepeatedNoise,
  effectiveMaxLines,
  listRtkCommandSamples,
  maybePersistRtkRawOutput2 as maybePersistRtkRawOutput,
  processRtkText,
  readRtkRawOutput,
  redactRtkRawOutput,
  rtkEngine,
  runRtkFilterTests,
  suggestFilter
};
