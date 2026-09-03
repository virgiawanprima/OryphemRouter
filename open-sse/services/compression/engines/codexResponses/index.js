import { createCompressionStats } from "../../stats.js";
import {
  DEFAULT_CODEX_RESPONSES_CONFIG
} from "../../types.js";
import { CODEX_RESPONSE_ITEM_META } from "../../bodyAdapter.js";
import { countTextTokens } from "../../../../utils/omni/tiktokenCounter.js";
const ENGINE_ID = "codex-responses";
function countCodexTokens(text) {
  if (!text) return 0;
  return countTextTokens(text, { provider: "codex" });
}
const SUPPORTED_TYPES = /* @__PURE__ */ new Set([
  "function_call_output",
  "local_shell_call_output",
  "apply_patch_call_output"
]);
const DIFF_HUNK_RE = /^@@{1,2}\s+-\d+(?:,\d+)?(?:\s+-\d+(?:,\d+)?)*\s+\+\d+(?:,\d+)?(?:,\d+)?\s+@@{1,2}/m;
const SEARCH_LINE_RE = /^\s*(?:[\w./-]+:\d+(?::\d+)?:|\d+(?::\d+)?[-:])\s*\S/m;
const IMPORTANT_LOG_RE = /(?:^|\b)(?:error|warning|warn|failed|failure|fatal|panic|exception|traceback|assertion|exit\s+code)\b/i;
const BUILD_RE = /\b(?:build|compile|test|lint|npm|yarn|pnpm|mix|make|cargo|gradle|maven|pytest|rspec|exunit)\b/i;
const CODEX_SCHEMA = [
  { key: "enabled", type: "boolean", label: "Enabled", defaultValue: false },
  {
    key: "minBytes",
    type: "number",
    label: "Minimum output bytes",
    defaultValue: DEFAULT_CODEX_RESPONSES_CONFIG.minBytes,
    min: 0,
    max: 2e6
  },
  {
    key: "maxOutputBytes",
    type: "number",
    label: "Maximum output bytes",
    defaultValue: DEFAULT_CODEX_RESPONSES_CONFIG.maxOutputBytes,
    min: 1,
    max: 1e7
  },
  {
    key: "maxCandidateBytes",
    type: "number",
    label: "Maximum candidate bytes",
    defaultValue: DEFAULT_CODEX_RESPONSES_CONFIG.maxCandidateBytes,
    min: 1,
    max: 2e6
  },
  {
    key: "maxLines",
    type: "number",
    label: "Maximum retained lines",
    defaultValue: DEFAULT_CODEX_RESPONSES_CONFIG.maxLines,
    min: 1,
    max: 1e4
  }
];
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function bounded(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}
function mergeConfig(options) {
  const source = options?.config?.codexResponsesConfig ?? {};
  const step = options?.stepConfig ?? {};
  const merged = { ...DEFAULT_CODEX_RESPONSES_CONFIG, ...source, ...step };
  return {
    ...DEFAULT_CODEX_RESPONSES_CONFIG,
    enabled: merged.enabled !== false,
    minBytes: bounded(merged.minBytes, DEFAULT_CODEX_RESPONSES_CONFIG.minBytes, 0, 2e6),
    maxOutputBytes: bounded(
      merged.maxOutputBytes,
      DEFAULT_CODEX_RESPONSES_CONFIG.maxOutputBytes,
      1,
      1e7
    ),
    maxCandidateBytes: bounded(
      merged.maxCandidateBytes,
      DEFAULT_CODEX_RESPONSES_CONFIG.maxCandidateBytes,
      1,
      2e6
    ),
    maxLines: bounded(merged.maxLines, DEFAULT_CODEX_RESPONSES_CONFIG.maxLines, 1, 1e4),
    minSearchMatches: bounded(
      merged.minSearchMatches,
      DEFAULT_CODEX_RESPONSES_CONFIG.minSearchMatches,
      2,
      1e4
    ),
    minLogLines: bounded(merged.minLogLines, DEFAULT_CODEX_RESPONSES_CONFIG.minLogLines, 2, 1e4),
    preserveToolNames: Array.isArray(merged.preserveToolNames) ? merged.preserveToolNames.filter((name) => typeof name === "string") : DEFAULT_CODEX_RESPONSES_CONFIG.preserveToolNames
  };
}
function minifyJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) && !isRecord(parsed)) return null;
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}
function collapseLines(text, config) {
  const lines = text.split(/\r?\n/);
  if (lines.length < config.minLogLines) return null;
  const important = lines.map((line, index) => ({ line, index })).filter(
    ({ line }) => IMPORTANT_LOG_RE.test(line) || /^(?:\s*(?:at\s|File\s|\S+[:(]\d+))/.test(line)
  ).map(({ index }) => index);
  if (important.length === 0 && !BUILD_RE.test(text)) return null;
  const keep = /* @__PURE__ */ new Set();
  for (let index = 0; index < Math.min(8, lines.length); index++) keep.add(index);
  for (let index = Math.max(0, lines.length - 8); index < lines.length; index++) keep.add(index);
  for (const index of important) {
    for (let offset = -2; offset <= 2; offset++) {
      if (index + offset >= 0 && index + offset < lines.length) keep.add(index + offset);
    }
  }
  const indexes = [...keep].sort((a, b) => a - b).slice(0, config.maxLines);
  const output = [];
  let previous = -1;
  for (const index of indexes) {
    if (index - previous > 1)
      output.push(`[compressed log output: omitted ${index - previous - 1} lines]`);
    output.push(lines[index]);
    previous = index;
  }
  if (previous < lines.length - 1)
    output.push(`[compressed log output: omitted ${lines.length - previous - 1} lines]`);
  return output.join("\n");
}
function compactDiff(text, config) {
  if (!DIFF_HUNK_RE.test(text)) return null;
  const lines = text.split(/\r?\n/);
  const output = [];
  let changedSinceContext = 0;
  for (const line of lines) {
    const changed = line.startsWith("+") || line.startsWith("-") || line.startsWith("@@");
    if (changed) {
      output.push(line);
      changedSinceContext = 0;
    } else if (changedSinceContext < 2) {
      output.push(line);
      changedSinceContext++;
    }
  }
  return output.length < lines.length && output.length <= config.maxLines * 4 ? output.join("\n") : null;
}
function compactSearch(text, config) {
  const lines = text.split(/\r?\n/);
  const matches = lines.filter((line) => SEARCH_LINE_RE.test(line));
  if (matches.length < config.minSearchMatches) return null;
  const grouped = /* @__PURE__ */ new Map();
  for (const line of matches) {
    const path = line.trim().split(/:\d/)[0].split(/-\d/)[0];
    const group = grouped.get(path) ?? [];
    if (group.length < 3) group.push(line.trim());
    grouped.set(path, group);
  }
  const output = [...grouped.entries()].map(([path, entries]) => [path, ...entries].join("\n")).join("\n");
  return output.length < text.length ? output : null;
}
function candidateRewrite(text, config) {
  if (Buffer.byteLength(text, "utf8") < config.minBytes) return null;
  if (Buffer.byteLength(text, "utf8") > config.maxCandidateBytes) return null;
  const json = minifyJson(text);
  const diff = compactDiff(text, config);
  const search = compactSearch(text, config);
  const log = collapseLines(text, config);
  return [json, diff, search, log].filter((value) => typeof value === "string").sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b))[0] ?? null;
}
function rewriteText(value, config) {
  if (typeof value !== "string") return null;
  if (Buffer.byteLength(value, "utf8") > config.maxOutputBytes) return null;
  const rewritten = candidateRewrite(value, config);
  if (!rewritten || Buffer.byteLength(rewritten) >= Buffer.byteLength(value)) return null;
  if (countCodexTokens(rewritten) >= countCodexTokens(value)) {
    return null;
  }
  return rewritten;
}
function hasLossyRewriteCandidate(text, config) {
  if (typeof text !== "string") return false;
  return compactDiff(text, config) !== null || compactSearch(text, config) !== null || collapseLines(text, config) !== null;
}
function protectedByConfig(meta) {
  return !SUPPORTED_TYPES.has(meta.type) || !meta.eligible;
}
const codexResponsesEngine = {
  id: ENGINE_ID,
  name: "Responses Tool Output",
  description: "Conservative lossless-first compression for supported Responses tool outputs.",
  icon: "data_object",
  targets: ["tool_results"],
  stackable: true,
  stackPriority: 12,
  metadata: {
    id: ENGINE_ID,
    name: "Responses Tool Output",
    description: "Compresses eligible shell, patch, search, build, and JSON outputs.",
    inputScope: "tool-results",
    targetLatencyMs: 5,
    supportsPreview: true,
    stable: true
  },
  apply(body, options) {
    const config = mergeConfig(options);
    if (!config.enabled || !Array.isArray(body.messages)) {
      return { body, compressed: false, stats: null };
    }
    let changed = false;
    const messages = body.messages.map((raw) => {
      if (!isRecord(raw) || raw.role !== "tool") return raw;
      const meta = raw[CODEX_RESPONSE_ITEM_META];
      if (!meta || typeof meta.type !== "string" || meta.eligible !== true) return raw;
      const typeMeta = { type: meta.type, eligible: true };
      if (protectedByConfig(typeMeta)) return raw;
      if (meta.type === "local_shell_call_output" && hasLossyRewriteCandidate(raw.content, config)) {
        return raw;
      }
      const next = rewriteText(raw.content, config);
      if (next === null) return raw;
      changed = true;
      return { ...raw, content: next };
    });
    if (!changed) return { body, compressed: false, stats: null };
    const nextBody = { ...body, messages };
    const stats = createCompressionStats(body, nextBody, "codex-responses", [ENGINE_ID]);
    const originalTokens = countCodexTokens(JSON.stringify(body));
    const compressedTokens = countCodexTokens(JSON.stringify(nextBody));
    stats.originalTokens = originalTokens;
    stats.compressedTokens = compressedTokens;
    stats.savingsPercent = originalTokens > 0 ? Math.round((originalTokens - compressedTokens) / originalTokens * 1e4) / 100 : 0;
    return { body: nextBody, compressed: stats.compressedTokens < stats.originalTokens, stats };
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config });
  },
  getConfigSchema() {
    return CODEX_SCHEMA;
  },
  validateConfig(config) {
    const errors = [];
    for (const [key, min, max] of [
      ["minBytes", 0, 2e6],
      ["maxOutputBytes", 1, 1e7],
      ["maxCandidateBytes", 1, 2e6],
      ["maxLines", 1, 1e4],
      ["minSearchMatches", 2, 1e4],
      ["minLogLines", 2, 1e4]
    ]) {
      if (config[key] !== void 0 && (typeof config[key] !== "number" || config[key] < min || config[key] > max)) {
        errors.push(`${key} must be between ${min} and ${max}`);
      }
    }
    if (config.enabled !== void 0 && typeof config.enabled !== "boolean")
      errors.push("enabled must be boolean");
    return { valid: errors.length === 0, errors };
  }
};
export {
  codexResponsesEngine
};
