import { DEFAULT_RTK_CONFIG } from "../../types.js";
const RTK_SCHEMA = [
  {
    key: "intensity",
    type: "select",
    label: "Intensity",
    defaultValue: DEFAULT_RTK_CONFIG.intensity,
    options: [
      { value: "minimal", label: "minimal" },
      { value: "standard", label: "standard" },
      { value: "aggressive", label: "aggressive" }
    ]
  },
  {
    key: "applyToToolResults",
    type: "boolean",
    label: "Apply to tool results",
    defaultValue: DEFAULT_RTK_CONFIG.applyToToolResults
  },
  {
    key: "applyToAssistantMessages",
    type: "boolean",
    label: "Apply to assistant messages",
    defaultValue: DEFAULT_RTK_CONFIG.applyToAssistantMessages
  },
  {
    key: "applyToCodeBlocks",
    type: "boolean",
    label: "Apply to code blocks",
    defaultValue: DEFAULT_RTK_CONFIG.applyToCodeBlocks
  },
  {
    key: "maxLinesPerResult",
    type: "number",
    label: "Max lines per result",
    defaultValue: DEFAULT_RTK_CONFIG.maxLinesPerResult,
    min: 0,
    max: 5e3
  },
  {
    key: "maxCharsPerResult",
    type: "number",
    label: "Max chars per result",
    defaultValue: DEFAULT_RTK_CONFIG.maxCharsPerResult,
    min: 0,
    max: 5e5
  },
  {
    key: "deduplicateThreshold",
    type: "number",
    label: "Deduplicate threshold",
    defaultValue: DEFAULT_RTK_CONFIG.deduplicateThreshold,
    min: 2,
    max: 100
  },
  {
    key: "rawOutputRetention",
    type: "select",
    label: "Raw output retention",
    defaultValue: DEFAULT_RTK_CONFIG.rawOutputRetention,
    options: [
      { value: "never", label: "never" },
      { value: "failures", label: "failures" },
      { value: "always", label: "always" }
    ]
  },
  {
    key: "rawOutputMaxFiles",
    type: "number",
    label: "Max raw-output files (oldest purged beyond this)",
    defaultValue: DEFAULT_RTK_CONFIG.rawOutputMaxFiles,
    min: 1,
    max: 1e7
  },
  {
    key: "rawOutputMaxAgeDays",
    type: "number",
    label: "Max raw-output age (days)",
    defaultValue: DEFAULT_RTK_CONFIG.rawOutputMaxAgeDays,
    min: 1,
    max: 3650
  },
  {
    key: "enableRenderers",
    type: "boolean",
    label: "Semantic renderers",
    defaultValue: DEFAULT_RTK_CONFIG.enableRenderers
  }
];
function validateRtkEngineConfig(config) {
  const errors = [];
  if (config.intensity !== void 0 && config.intensity !== "minimal" && config.intensity !== "standard" && config.intensity !== "aggressive") {
    errors.push("intensity must be minimal, standard, or aggressive");
  }
  for (const key of [
    "enabled",
    "applyToToolResults",
    "applyToAssistantMessages",
    "applyToCodeBlocks"
  ]) {
    if (config[key] !== void 0 && typeof config[key] !== "boolean") {
      errors.push(`${key} must be a boolean`);
    }
  }
  for (const key of ["maxLinesPerResult", "maxCharsPerResult", "deduplicateThreshold"]) {
    if (config[key] !== void 0 && (typeof config[key] !== "number" || config[key] < 0)) {
      errors.push(`${key} must be a non-negative number`);
    }
  }
  if (config.enabledFilters !== void 0 && !Array.isArray(config.enabledFilters)) {
    errors.push("enabledFilters must be an array");
  }
  if (config.disabledFilters !== void 0 && !Array.isArray(config.disabledFilters)) {
    errors.push("disabledFilters must be an array");
  }
  if (config.rawOutputRetention !== void 0 && config.rawOutputRetention !== "never" && config.rawOutputRetention !== "failures" && config.rawOutputRetention !== "always") {
    errors.push("rawOutputRetention must be never, failures, or always");
  }
  for (const key of ["rawOutputMaxFiles", "rawOutputMaxAgeDays"]) {
    if (config[key] !== void 0 && (typeof config[key] !== "number" || config[key] < 1)) {
      errors.push(`${key} must be a positive number`);
    }
  }
  return { valid: errors.length === 0, errors };
}
export {
  RTK_SCHEMA,
  validateRtkEngineConfig
};
