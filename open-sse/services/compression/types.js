import { ENGINE_IDS } from "./engineCatalog.js";
const DEFAULT_CODEX_RESPONSES_CONFIG = {
  enabled: false,
  minBytes: 512,
  maxOutputBytes: 2 * 1024 * 1024,
  maxCandidateBytes: 512 * 1024,
  maxLines: 160,
  minSearchMatches: 8,
  minLogLines: 24,
  preserveToolNames: [
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "WebSearch",
    "WebFetch",
    "read",
    "glob",
    "grep",
    "write",
    "edit",
    "web_search",
    "web_fetch"
  ]
};
const DEFAULT_COMPRESSION_CONFIG = {
  enabled: false,
  defaultMode: "off",
  autoTriggerMode: "lite",
  autoTriggerTokens: 0,
  cacheMinutes: 5,
  preserveSystemPrompt: true,
  preserveSystemPromptMode: "always",
  mcpDescriptionCompressionEnabled: true,
  comboOverrides: {},
  compressionComboId: null,
  stackedPipeline: [
    { engine: "rtk", intensity: "standard" },
    { engine: "caveman", intensity: "full" }
  ],
  engines: Object.fromEntries(ENGINE_IDS.map((id) => [id, { enabled: false }])),
  activeComboId: null,
  ultraEngine: "heuristic",
  ultraSlmPrewarm: false,
  liveZone: { enabled: false },
  lite: { compressToolResults: true },
  codexResponsesConfig: { ...DEFAULT_CODEX_RESPONSES_CONFIG }
};
const DEFAULT_CAVEMAN_CONFIG = {
  enabled: false,
  compressRoles: ["user"],
  skipRules: [],
  minMessageLength: 50,
  // Protect code blocks, inline code, file paths, URLs, and error/stack lines
  // from caveman compression so signal-carrying content is never mangled.
  preservePatterns: [
    "```[\\s\\S]*?```",
    "`[^`\\n]+`",
    "\\b(https?://\\S+)",
    "(?:^|\\s)(\\.{0,2}/[\\w./\\-]+)",
    "^\\s*(Error|TypeError|RangeError|SyntaxError|ReferenceError):",
    "^\\s+at\\s"
  ],
  intensity: "lite"
};
const DEFAULT_CAVEMAN_OUTPUT_MODE_CONFIG = {
  enabled: false,
  intensity: "lite",
  autoClarity: true
};
const DEFAULT_RTK_CONFIG = {
  enabled: false,
  intensity: "minimal",
  applyToToolResults: true,
  applyToCodeBlocks: false,
  applyToAssistantMessages: false,
  enabledFilters: [],
  disabledFilters: [],
  maxLinesPerResult: 120,
  maxCharsPerResult: 12e3,
  deduplicateThreshold: 3,
  customFiltersEnabled: true,
  trustProjectFilters: false,
  rawOutputRetention: "never",
  rawOutputMaxBytes: 1048576,
  rawOutputMaxFiles: 1e5,
  rawOutputMaxAgeDays: 30,
  enableGrouping: false,
  groupingThreshold: 3,
  stripCodeComments: false,
  preserveDocstrings: true,
  enableRenderers: false
};
const DEFAULT_COMPRESSION_LANGUAGE_CONFIG = {
  enabled: false,
  defaultLanguage: "en",
  autoDetect: true,
  enabledPacks: ["en"]
};
const DEFAULT_OMNIGLYPH_CONFIG = {
  profile: "aggressive"
};
const DEFAULT_CONTEXT_EDITING_CONFIG = {
  enabled: false
};
const DEFAULT_AGGRESSIVE_CONFIG = {
  thresholds: { fullSummary: 5, moderate: 3, light: 2, verbatim: 2 },
  toolStrategies: {
    fileContent: true,
    grepSearch: true,
    shellOutput: true,
    json: true,
    errorMessage: true
  },
  summarizerEnabled: true,
  maxTokensPerMessage: 2048,
  minSavingsThreshold: 0.05
};
const DEFAULT_ULTRA_CONFIG = {
  enabled: false,
  compressionRate: 0.5,
  minScoreThreshold: 0.3,
  slmFallbackToAggressive: true,
  maxTokensPerMessage: 0
};
const DEFAULT_HEADROOM_CONFIG = {
  minRows: 8
};
const DEFAULT_SESSION_DEDUP_CONFIG = {
  minBlockChars: 80,
  fuzzy: false
};
const DEFAULT_CCR_CONFIG = {
  minChars: 600,
  retrievalRampFactor: 2
};
import {
  DEFAULT_MCP_ACCESSIBILITY_CONFIG,
  clampMcpAccessibilityConfig
} from "./engines/mcpAccessibility/constants.js";
export {
  DEFAULT_AGGRESSIVE_CONFIG,
  DEFAULT_CAVEMAN_CONFIG,
  DEFAULT_CAVEMAN_OUTPUT_MODE_CONFIG,
  DEFAULT_CCR_CONFIG,
  DEFAULT_CODEX_RESPONSES_CONFIG,
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_COMPRESSION_LANGUAGE_CONFIG,
  DEFAULT_CONTEXT_EDITING_CONFIG,
  DEFAULT_HEADROOM_CONFIG,
  DEFAULT_MCP_ACCESSIBILITY_CONFIG,
  DEFAULT_OMNIGLYPH_CONFIG,
  DEFAULT_RTK_CONFIG,
  DEFAULT_SESSION_DEDUP_CONFIG,
  DEFAULT_ULTRA_CONFIG,
  ENGINE_IDS,
  clampMcpAccessibilityConfig
};
