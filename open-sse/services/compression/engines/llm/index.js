import { createCompressionStats, estimateCompressionTokens } from "../../stats.js";
import { extractPreservedBlocks } from "../../preservation.js";
const noopBackend = async (text) => text;
let _backend = null;
function setLlmCompressorBackend(b) {
  _backend = b;
}
function resolveBackend() {
  return _backend ?? noopBackend;
}
function splitProseAndPreserved(text) {
  const { text: withPlaceholders, blocks } = extractPreservedBlocks(text);
  if (blocks.length === 0) return [{ kind: "prose", text }];
  const placeholderToOriginal = new Map(blocks.map((b) => [b.placeholder, b.content]));
  const escaped = blocks.map((b) => b.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const splitRe = new RegExp(`(${escaped.join("|")})`, "g");
  const segments = [];
  for (const part of withPlaceholders.split(splitRe)) {
    if (!part) continue;
    const original = placeholderToOriginal.get(part);
    segments.push(
      original !== void 0 ? { kind: "preserved", text: original } : { kind: "prose", text: part }
    );
  }
  return segments;
}
async function compressProseText(text, backend, opts) {
  if (!text.trim()) return { text, didCompress: false };
  try {
    const compressed = await backend(text, opts);
    if (typeof compressed === "string" && compressed.length < text.length) {
      return { text: compressed, didCompress: true };
    }
    return { text, didCompress: false };
  } catch {
    return { text, didCompress: false };
  }
}
async function compressMessageText(text, backend, opts) {
  const segments = splitProseAndPreserved(text);
  let anyCompressed = false;
  const parts = [];
  for (const seg of segments) {
    if (seg.kind === "preserved") {
      parts.push(seg.text);
    } else {
      const { text: out, didCompress } = await compressProseText(seg.text, backend, opts);
      parts.push(out);
      if (didCompress) anyCompressed = true;
    }
  }
  return { text: parts.join(""), didCompress: anyCompressed };
}
async function processMessages(messages, backend, opts) {
  let compressedCount = 0;
  const result = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      result.push({ ...msg });
      continue;
    }
    try {
      if (typeof msg.content === "string") {
        const { text, didCompress } = await compressMessageText(msg.content, backend, opts);
        if (didCompress) {
          compressedCount++;
          result.push({ ...msg, content: text });
        } else {
          result.push({ ...msg });
        }
      } else if (Array.isArray(msg.content)) {
        let changed = false;
        const newContent = [];
        for (const part of msg.content) {
          if (part["type"] === "text" && typeof part["text"] === "string") {
            const { text, didCompress } = await compressMessageText(
              part["text"],
              backend,
              opts
            );
            if (didCompress) {
              changed = true;
              compressedCount++;
              newContent.push({ ...part, text });
            } else {
              newContent.push(part);
            }
          } else {
            newContent.push(part);
          }
        }
        result.push(changed ? { ...msg, content: newContent } : { ...msg });
      } else {
        result.push({ ...msg });
      }
    } catch {
      result.push({ ...msg });
    }
  }
  return { messages: result, compressedCount };
}
const LLM_COMPRESSOR_SCHEMA = [
  // Default OFF: this tier costs an extra model call and mutates the payload, so it is
  // opt-in (Hard Rule #20 spirit) — never on by default.
  { key: "enabled", type: "boolean", label: "Enabled", defaultValue: false },
  { key: "model", type: "string", label: "Compression model", defaultValue: "" },
  {
    key: "minTokens",
    type: "number",
    label: "Min tokens (floor)",
    defaultValue: 2e3,
    min: 0,
    max: 1e5
  },
  {
    key: "compressionRate",
    type: "number",
    label: "Compression rate (keep ratio)",
    defaultValue: 0.5,
    min: 0.1,
    max: 0.9
  }
];
function validateLlmCompressorConfig(config) {
  const errors = [];
  if (config["enabled"] !== void 0 && typeof config["enabled"] !== "boolean") {
    errors.push("enabled must be a boolean");
  }
  if (config["model"] !== void 0 && typeof config["model"] !== "string") {
    errors.push("model must be a string");
  }
  if (config["minTokens"] !== void 0) {
    const v = config["minTokens"];
    if (typeof v !== "number" || Number.isNaN(v) || v < 0) errors.push("minTokens must be a number >= 0");
  }
  if (config["compressionRate"] !== void 0) {
    const v = config["compressionRate"];
    if (typeof v !== "number" || Number.isNaN(v) || v < 0.1 || v > 0.9) {
      errors.push("compressionRate must be a number between 0.1 and 0.9");
    }
  }
  return { valid: errors.length === 0, errors };
}
const ENGINE_ID = "llm";
const llmCompressorEngine = {
  id: ENGINE_ID,
  name: "LLM Compressor (opt-in)",
  description: "Opt-in LLM-tier compression: condenses the prose of non-system messages via a pluggable chat-completion backend. Default-off and a no-op until an operator both enables it and wires a real backend; fenced code blocks and system messages are never sent to the model. Fail-opens on any backend error.",
  icon: "robot",
  targets: ["messages"],
  stackable: true,
  // Runs after llmlingua (35) but before ultra (40); semantic LLM rewriting is most useful
  // once cheaper structural/semantic passes have already reduced the prose.
  stackPriority: 38,
  metadata: {
    id: ENGINE_ID,
    name: "LLM Compressor (opt-in)",
    description: "Opt-in LLM-tier prose compression via a pluggable backend. Default-off / no-op; code blocks and system messages are protected; fail-open on backend error.",
    inputScope: "messages",
    targetLatencyMs: 1500,
    supportsPreview: false,
    stable: true
  },
  /** Synchronous pass-through — the real work is async-only (`applyAsync`). */
  apply(body) {
    return { body, compressed: false, stats: null };
  },
  async applyAsync(body, options) {
    const stepConfig = options?.stepConfig ?? {};
    if (stepConfig["enabled"] !== true) {
      return { body, compressed: false, stats: null };
    }
    const messages = body["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const minTokens = typeof stepConfig["minTokens"] === "number" ? stepConfig["minTokens"] : 2e3;
    if (minTokens > 0) {
      const nonSystemText = messages.filter((m) => m.role !== "system").map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")).join("\n");
      if (estimateCompressionTokens(nonSystemText) < minTokens) {
        return { body, compressed: false, stats: null };
      }
    }
    const backendOpts = {
      model: typeof stepConfig["model"] === "string" ? stepConfig["model"] : void 0,
      compressionRate: typeof stepConfig["compressionRate"] === "number" ? stepConfig["compressionRate"] : void 0
    };
    try {
      const backend = resolveBackend();
      const start = performance.now();
      const { messages: newMessages, compressedCount } = await processMessages(
        messages,
        backend,
        backendOpts
      );
      if (compressedCount === 0) {
        return { body, compressed: false, stats: null };
      }
      const newBody = { ...body, messages: newMessages };
      const durationMs = Math.round(performance.now() - start);
      const stats = createCompressionStats(
        body,
        newBody,
        "stacked",
        [ENGINE_ID],
        [`llm-compressed-${compressedCount}-messages`],
        durationMs
      );
      return { body: newBody, compressed: true, stats };
    } catch {
      return { body, compressed: false, stats: null };
    }
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config ?? {} });
  },
  getConfigSchema() {
    return LLM_COMPRESSOR_SCHEMA;
  },
  validateConfig(config) {
    return validateLlmCompressorConfig(config);
  }
};
export {
  llmCompressorEngine,
  setLlmCompressorBackend
};
