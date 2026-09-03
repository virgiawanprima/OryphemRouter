const MCP_ACCESSIBILITY_DEFAULTS = {
  maxTextChars: 5e4,
  collapseThreshold: 30,
  collapseKeepHead: 10,
  collapseKeepTail: 5,
  minLengthToProcess: 2e3,
  preserveRefPattern: /\[ref=e\d+\]/g
};
const DEFAULT_MCP_ACCESSIBILITY_CONFIG = {
  enabled: true,
  maxTextChars: MCP_ACCESSIBILITY_DEFAULTS.maxTextChars,
  collapseThreshold: MCP_ACCESSIBILITY_DEFAULTS.collapseThreshold,
  collapseKeepHead: MCP_ACCESSIBILITY_DEFAULTS.collapseKeepHead,
  collapseKeepTail: MCP_ACCESSIBILITY_DEFAULTS.collapseKeepTail,
  minLengthToProcess: MCP_ACCESSIBILITY_DEFAULTS.minLengthToProcess
};
const MCP_ACCESSIBILITY_TAIL_RESERVE = 300;
const MCP_ACCESSIBILITY_MIN_MAX_TEXT_CHARS = MCP_ACCESSIBILITY_TAIL_RESERVE * 2;
function boundedInt(value, min, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}
function clampMcpAccessibilityConfig(raw) {
  const record = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_MCP_ACCESSIBILITY_CONFIG;
  return {
    enabled: record["enabled"] !== false,
    maxTextChars: boundedInt(record["maxTextChars"], MCP_ACCESSIBILITY_MIN_MAX_TEXT_CHARS, d.maxTextChars),
    collapseThreshold: boundedInt(record["collapseThreshold"], 1, d.collapseThreshold),
    collapseKeepHead: boundedInt(record["collapseKeepHead"], 0, d.collapseKeepHead),
    collapseKeepTail: boundedInt(record["collapseKeepTail"], 0, d.collapseKeepTail),
    minLengthToProcess: boundedInt(record["minLengthToProcess"], 1, d.minLengthToProcess)
  };
}
export {
  DEFAULT_MCP_ACCESSIBILITY_CONFIG,
  MCP_ACCESSIBILITY_DEFAULTS,
  MCP_ACCESSIBILITY_MIN_MAX_TEXT_CHARS,
  MCP_ACCESSIBILITY_TAIL_RESERVE,
  clampMcpAccessibilityConfig
};
