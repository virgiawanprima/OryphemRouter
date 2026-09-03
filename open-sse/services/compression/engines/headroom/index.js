import { createCompressionStats } from "../../stats.js";
import { crushMessages, DEFAULT_MIN_ROWS } from "./smartcrusher.js";
import {
  TABULAR_FENCE_OPEN,
  TABULAR_FENCE_CLOSE,
  GCF_FENCE_OPEN,
  GCF_FENCE_CLOSE,
  decodeTabular
} from "./tabular.js";
import { TOON_FENCE_OPEN, TOON_FENCE_CLOSE } from "./toon.js";
import { encodeTabular, decodeTabular as decodeTabular2 } from "./tabular.js";
const ENGINE_ID = "headroom";
const HEADROOM_SCHEMA = [
  {
    key: "enabled",
    type: "boolean",
    label: "Enabled",
    defaultValue: true
  },
  {
    key: "minRows",
    type: "number",
    label: "Minimum rows to compact",
    description: "Minimum number of rows in a homogeneous JSON array to trigger tabular compaction. Default: 8.",
    defaultValue: DEFAULT_MIN_ROWS,
    min: 2,
    max: 1e4
  }
];
function validateHeadroomConfig(config) {
  const errors = [];
  if (config["enabled"] !== void 0 && typeof config["enabled"] !== "boolean") {
    errors.push("enabled must be a boolean");
  }
  if (config["minRows"] !== void 0) {
    const v = config["minRows"];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 2) {
      errors.push("minRows must be a number \u2265 2");
    }
  }
  return { valid: errors.length === 0, errors };
}
const headroomEngine = {
  id: ENGINE_ID,
  name: "Headroom SmartCrusher",
  description: "Lossless tabular compaction of homogeneous JSON arrays (H3 + N5 + GP5'). Replaces repetitive JSON arrays with compact columnar blocks, including explicit [N rows] count markers for auditability.",
  icon: "compress",
  targets: ["messages", "tool_results"],
  stackable: true,
  // stackPriority 15 = between rtk (10) and caveman (20), as specified in headroom-plano.
  stackPriority: 15,
  metadata: {
    id: ENGINE_ID,
    name: "Headroom SmartCrusher",
    description: "Lossless tabular compaction of homogeneous JSON arrays with [N rows] count markers.",
    inputScope: "messages",
    targetLatencyMs: 5,
    supportsPreview: true,
    stable: true
  },
  apply(body, options) {
    const stepConfig = options?.stepConfig ?? {};
    if (stepConfig["enabled"] === false) {
      return { body, compressed: false, stats: null };
    }
    const minRows = typeof stepConfig["minRows"] === "number" ? stepConfig["minRows"] : DEFAULT_MIN_ROWS;
    const messages = body["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const start = performance.now();
    const { messages: crushedMessages, changed } = crushMessages(
      messages,
      minRows
    );
    if (!changed) {
      return { body, compressed: false, stats: null };
    }
    const newBody = {
      ...body,
      messages: crushedMessages
    };
    const durationMs = Math.round(performance.now() - start);
    const stats = createCompressionStats(
      body,
      newBody,
      "stacked",
      ["headroom-smartcrusher"],
      ["tabular-compaction"],
      durationMs
    );
    return { body: newBody, compressed: true, stats };
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config ?? {} });
  },
  getConfigSchema() {
    return HEADROOM_SCHEMA;
  },
  validateConfig(config) {
    return validateHeadroomConfig(config);
  }
};
function reconstructHeadroom(body) {
  const messages = body["messages"];
  if (!Array.isArray(messages)) return body;
  let changed = false;
  const restored = messages.map((msg) => {
    if (typeof msg.content === "string") {
      const reconstructed = restoreText(msg.content);
      if (reconstructed !== msg.content) {
        changed = true;
        return { ...msg, content: reconstructed };
      }
      return { ...msg };
    }
    if (Array.isArray(msg.content)) {
      let contentChanged = false;
      const newContent = msg.content.map((part) => {
        if (part["type"] !== "text" || typeof part["text"] !== "string") return part;
        const reconstructed = restoreText(part["text"]);
        if (reconstructed !== part["text"]) {
          contentChanged = true;
          return { ...part, text: reconstructed };
        }
        return part;
      });
      if (contentChanged) {
        changed = true;
        return { ...msg, content: newContent };
      }
      return { ...msg };
    }
    return { ...msg };
  });
  if (!changed) return body;
  return { ...body, messages: restored };
}
function closeTagFor(fence) {
  if (fence === GCF_FENCE_OPEN) return GCF_FENCE_CLOSE;
  if (fence === TOON_FENCE_OPEN) return TOON_FENCE_CLOSE;
  return TABULAR_FENCE_CLOSE;
}
function decodeFenceOccurrences(text, fence, closeTag) {
  let result = text;
  let searchFrom = 0;
  while (true) {
    const fenceStart = result.indexOf(fence, searchFrom);
    if (fenceStart === -1) break;
    const contentStart = fenceStart + fence.length + 1;
    const fenceEnd = result.indexOf("\n" + closeTag, contentStart);
    if (fenceEnd === -1) break;
    const blockContent = result.slice(contentStart, fenceEnd);
    const decoded = decodeTabular(fence + "\n" + blockContent + "\n" + closeTag);
    const jsonStr = JSON.stringify(decoded);
    const fullFence = result.slice(fenceStart, fenceEnd + closeTag.length + 1);
    result = result.slice(0, fenceStart) + jsonStr + result.slice(fenceStart + fullFence.length);
    searchFrom = fenceStart + jsonStr.length;
  }
  return result;
}
function restoreText(text) {
  if (!text.includes(TABULAR_FENCE_OPEN) && !text.includes(GCF_FENCE_OPEN) && !text.includes(TOON_FENCE_OPEN))
    return text;
  let result = text;
  for (const fence of [GCF_FENCE_OPEN, TABULAR_FENCE_OPEN, TOON_FENCE_OPEN]) {
    result = decodeFenceOccurrences(result, fence, closeTagFor(fence));
  }
  return result;
}
export {
  decodeTabular2 as decodeTabular,
  encodeTabular,
  headroomEngine,
  reconstructHeadroom
};
