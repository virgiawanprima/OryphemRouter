import { createCompressionStats } from "../../stats.js";
import { runIonizerPass } from "./sample.js";
const ENGINE_ID = "ionizer";
const IONIZER_SCHEMA = [
  { key: "enabled", type: "boolean", label: "Enabled", defaultValue: true },
  {
    key: "threshold",
    type: "number",
    label: "Row threshold",
    description: "Only arrays with more than this many object rows are sampled. Default: 200.",
    defaultValue: 200,
    min: 2,
    max: 1e6
  },
  {
    key: "targetRows",
    type: "number",
    label: "Target kept rows",
    description: "Approximate number of rows kept inline after sampling. Default: 50.",
    defaultValue: 50,
    min: 1,
    max: 1e5
  }
];
function validateIonizerConfig(config) {
  const errors = [];
  if (config["enabled"] !== void 0 && typeof config["enabled"] !== "boolean") {
    errors.push("enabled must be a boolean");
  }
  for (const k of ["threshold", "targetRows"]) {
    if (config[k] !== void 0) {
      const v = config[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 1) {
        errors.push(`${k} must be a positive number`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
const ionizerEngine = {
  id: ENGINE_ID,
  name: "Ionizer",
  description: "Lossy statistical sampling of oversized homogeneous JSON arrays. Keeps schema + error rows + first/last rows + a seeded uniform middle sample inline; stores the whole array in CCR for recovery. Complements headroom (lossless) as the fallback when columnar still overflows.",
  icon: "filter_alt",
  targets: ["messages"],
  stackable: true,
  // stackPriority 13 = between rtk (10) and headroom (15): sample raw rows BEFORE headroom
  // losslessly compacts the survivors.
  stackPriority: 13,
  sampling: true,
  metadata: {
    id: ENGINE_ID,
    name: "Ionizer",
    description: "Lossy statistical sampling of oversized homogeneous JSON arrays, reversible via CCR.",
    inputScope: "messages",
    targetLatencyMs: 2,
    supportsPreview: true,
    stable: true
  },
  apply(body, options) {
    const stepConfig = options?.stepConfig ?? {};
    if (stepConfig["enabled"] === false) {
      return { body, compressed: false, stats: null };
    }
    const messages = body["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const start = performance.now();
    const { messages: finalMessages, ionizedCount } = runIonizerPass(
      messages,
      stepConfig,
      options?.principalId
    );
    if (ionizedCount === 0) {
      return { body, compressed: false, stats: null };
    }
    const newBody = { ...body, messages: finalMessages };
    const durationMs = Math.round(performance.now() - start);
    const stats = createCompressionStats(
      body,
      newBody,
      "stacked",
      ["ionizer"],
      [`ionizer-${ionizedCount}-arrays-sampled`],
      durationMs
    );
    return { body: newBody, compressed: true, stats };
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config ?? {} });
  },
  getConfigSchema() {
    return IONIZER_SCHEMA;
  },
  validateConfig(config) {
    return validateIonizerConfig(config);
  }
};
export {
  ionizerEngine
};
