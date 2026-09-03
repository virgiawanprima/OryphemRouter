import { createHash } from "node:crypto";
import {
  CLAUDE_CODE_CLIENT_BUILD_REVISION,
  CLAUDE_CODE_CLIENT_VERSION
} from "../utils/omni/claudeCodeClient.js";
const CCH_SALT = "59cf53e54c78";
const CCH_POSITIONS = [4, 7, 20];
const DEFAULT_CLAUDE_CODE_VERSION = CLAUDE_CODE_CLIENT_VERSION;
const CLAUDE_AGENT_SDK_IDENTITY = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";
const DEFAULT_PARAGRAPH_REMOVAL_ANCHORS = [
  "github.com/anomalyco/opencode",
  "opencode.ai/docs",
  "github.com/cline/cline",
  "github.com/getcursor/cursor",
  "continue.dev"
];
const DEFAULT_IDENTITY_PREFIXES = ["You are OpenCode"];
const DEFAULT_TEXT_REPLACEMENTS = [
  { match: "if OpenCode honestly", replacement: "if the assistant honestly" },
  {
    match: "Here is some useful information about the environment you are running in:",
    replacement: "Environment context you are running in:"
  }
];
const DEFAULT_CC_BRIDGE_PIPELINE = [
  // Sanitize caller-supplied system blocks first so dropped paragraphs do not
  // accidentally contain a stale billing header from a previous pass.
  {
    kind: "drop_paragraph_if_contains",
    needles: [...DEFAULT_PARAGRAPH_REMOVAL_ANCHORS]
  },
  {
    kind: "drop_paragraph_if_starts_with",
    prefixes: [...DEFAULT_IDENTITY_PREFIXES]
  },
  ...DEFAULT_TEXT_REPLACEMENTS.map((r) => ({
    kind: "replace_text",
    match: r.match,
    replacement: r.replacement,
    allOccurrences: true
  })),
  // Then prepend the SDK identity (becomes block[1] after billing prepend).
  {
    kind: "prepend_system_block",
    text: CLAUDE_AGENT_SDK_IDENTITY,
    idempotencyKey: "claude-agent-sdk-identity"
  },
  // Billing header always lands at block[0] — matches T4-200 fixture layout.
  {
    kind: "inject_billing_header",
    entrypoint: "sdk-cli",
    versionFormat: "ex-machina",
    cchAlgo: "sha256-first-user",
    buildRevision: CLAUDE_CODE_CLIENT_BUILD_REVISION
  }
];
const DEFAULT_CC_BRIDGE_TRANSFORMS_CONFIG = {
  enabled: true,
  pipeline: DEFAULT_CC_BRIDGE_PIPELINE
};
function extractFirstUserMessageText(messages) {
  if (!Array.isArray(messages)) return "";
  for (const msg of messages) {
    if (msg?.role !== "user") continue;
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type === "text" && typeof block.text === "string") {
          return block.text;
        }
      }
    }
  }
  return "";
}
function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function pickCharsAtPositions(text, positions) {
  return positions.map((p) => typeof text[p] === "string" ? text[p] : "\0").join("");
}
function computeExMachinaVersionSuffix(firstUserText, version) {
  const picks = pickCharsAtPositions(firstUserText, CCH_POSITIONS);
  return sha256Hex(`${CCH_SALT}${picks}${version}`).slice(0, 3);
}
function computeDaystampVersionSuffix(version, now = /* @__PURE__ */ new Date()) {
  const dayStamp = now.toISOString().slice(0, 10);
  return sha256Hex(`${dayStamp}${version}`).slice(0, 3);
}
function computeCchSha256FirstUser(firstUserText) {
  return sha256Hex(firstUserText).slice(0, 5);
}
function buildBillingHeaderValue(messages, options) {
  const version = options.version || DEFAULT_CLAUDE_CODE_VERSION;
  const firstUserText = extractFirstUserMessageText(messages);
  const suffix = options.buildRevision ?? (options.versionFormat === "omniroute-daystamp" ? computeDaystampVersionSuffix(version, options.now) : computeExMachinaVersionSuffix(firstUserText, version));
  let cch;
  switch (options.cchAlgo) {
    case "sha256-first-user":
      cch = computeCchSha256FirstUser(firstUserText);
      break;
    case "xxhash64-body":
    case "static-zero":
    default:
      cch = "00000";
      break;
  }
  return `x-anthropic-billing-header: cc_version=${version}.${suffix}; cc_entrypoint=${options.entrypoint}; cch=${cch};`;
}
function normalizeSystemToBlocks(system) {
  if (system === null || system === void 0) return [];
  if (typeof system === "string") {
    return system.length > 0 ? [{ type: "text", text: system }] : [];
  }
  if (Array.isArray(system)) {
    return system.filter((b) => !!b && typeof b === "object").map((b) => ({ ...b }));
  }
  if (typeof system === "object") {
    const block = system;
    return block && typeof block.text === "string" ? [{ ...block }] : [];
  }
  return [];
}
function isTextBlock(block) {
  return block.type === "text" && typeof block.text === "string";
}
function containsString(haystack, needle, caseSensitive) {
  if (caseSensitive) return haystack.includes(needle);
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
function startsWithString(haystack, prefix, caseSensitive) {
  if (caseSensitive) return haystack.startsWith(prefix);
  return haystack.toLowerCase().startsWith(prefix.toLowerCase());
}
function applyDropParagraphIfContains(blocks, op) {
  const caseSensitive = op.caseSensitive !== false;
  const needles = op.needles || [];
  if (needles.length === 0) return blocks;
  return blocks.map((block) => {
    if (!isTextBlock(block)) return block;
    const paragraphs = block.text.split(/\n\n+/);
    const filtered = paragraphs.filter(
      (p) => !needles.some((n) => containsString(p, n, caseSensitive))
    );
    return { ...block, text: filtered.join("\n\n") };
  });
}
function applyDropParagraphIfStartsWith(blocks, op) {
  const caseSensitive = op.caseSensitive !== false;
  const prefixes = op.prefixes || [];
  if (prefixes.length === 0) return blocks;
  return blocks.map((block) => {
    if (!isTextBlock(block)) return block;
    const paragraphs = block.text.split(/\n\n+/);
    const filtered = paragraphs.filter(
      (p) => !prefixes.some((prefix) => startsWithString(p.trimStart(), prefix, caseSensitive))
    );
    return { ...block, text: filtered.join("\n\n") };
  });
}
function applyReplaceText(blocks, op) {
  if (!op.match) return blocks;
  return blocks.map((block) => {
    if (!isTextBlock(block)) return block;
    if (!block.text.includes(op.match)) return block;
    let next = block.text;
    if (op.allOccurrences) {
      next = next.split(op.match).join(op.replacement);
    } else {
      next = next.replace(op.match, op.replacement);
    }
    return { ...block, text: next };
  });
}
function applyReplaceRegex(blocks, op) {
  if (!op.pattern) return blocks;
  let regex;
  try {
    regex = new RegExp(op.pattern, op.flags ?? "u");
  } catch {
    return blocks;
  }
  return blocks.map((block) => {
    if (!isTextBlock(block)) return block;
    return { ...block, text: block.text.replace(regex, op.replacement) };
  });
}
function applyDropBlockIfContains(blocks, op) {
  const needles = op.needles || [];
  if (needles.length === 0) return blocks;
  return blocks.filter((block) => {
    if (!isTextBlock(block)) return true;
    return !needles.some((n) => block.text.includes(n));
  });
}
function applyPrependSystemBlock(blocks, op) {
  if (!op.text) return blocks;
  const prefix = op.idempotencyKey ?? op.text;
  const alreadyPresent = blocks.some((b) => isTextBlock(b) && b.text.startsWith(prefix));
  if (alreadyPresent) return blocks;
  return [{ type: "text", text: op.text }, ...blocks];
}
function applyAppendSystemBlock(blocks, op) {
  if (!op.text) return blocks;
  const prefix = op.idempotencyKey;
  const alreadyPresent = prefix ? blocks.some((b) => isTextBlock(b) && b.text.startsWith(prefix)) : blocks.some((b) => isTextBlock(b) && b.text === op.text);
  if (alreadyPresent) return blocks;
  return [...blocks, { type: "text", text: op.text }];
}
function applyInjectBillingHeader(body, blocks, op) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const hasUser = messages.some((m) => m?.role === "user");
  if (!hasUser) return blocks;
  const headerValue = buildBillingHeaderValue(messages, {
    entrypoint: op.entrypoint,
    versionFormat: op.versionFormat,
    cchAlgo: op.cchAlgo,
    version: op.version,
    buildRevision: op.buildRevision
  });
  const headerPrefix = "x-anthropic-billing-header:";
  const filtered = blocks.filter((b) => !(isTextBlock(b) && b.text.startsWith(headerPrefix)));
  return [{ type: "text", text: headerValue }, ...filtered];
}
function applyCcBridgeTransformPipeline(body, config = getCcBridgeTransformsConfig()) {
  if (!body || typeof body !== "object") {
    return { body, appliedOpKinds: [] };
  }
  if (!config.enabled || !Array.isArray(config.pipeline) || config.pipeline.length === 0) {
    return { body, appliedOpKinds: [] };
  }
  let blocks = normalizeSystemToBlocks(body.system);
  const appliedOpKinds = [];
  for (const op of config.pipeline) {
    switch (op.kind) {
      case "drop_paragraph_if_contains":
        blocks = applyDropParagraphIfContains(blocks, op);
        break;
      case "drop_paragraph_if_starts_with":
        blocks = applyDropParagraphIfStartsWith(blocks, op);
        break;
      case "replace_text":
        blocks = applyReplaceText(blocks, op);
        break;
      case "replace_regex":
        blocks = applyReplaceRegex(blocks, op);
        break;
      case "drop_block_if_contains":
        blocks = applyDropBlockIfContains(blocks, op);
        break;
      case "prepend_system_block":
        blocks = applyPrependSystemBlock(blocks, op);
        break;
      case "append_system_block":
        blocks = applyAppendSystemBlock(blocks, op);
        break;
      case "inject_billing_header":
        blocks = applyInjectBillingHeader(body, blocks, op);
        break;
      default: {
        continue;
      }
    }
    appliedOpKinds.push(op.kind);
  }
  blocks = blocks.filter((b) => !isTextBlock(b) || b.text.length > 0);
  body.system = blocks;
  return { body, appliedOpKinds };
}
let _runtimeConfig = DEFAULT_CC_BRIDGE_TRANSFORMS_CONFIG;
function setCcBridgeTransformsConfig(config) {
  if (!config) {
    _runtimeConfig = DEFAULT_CC_BRIDGE_TRANSFORMS_CONFIG;
    return;
  }
  _runtimeConfig = {
    enabled: config.enabled !== false,
    pipeline: Array.isArray(config.pipeline) ? config.pipeline : DEFAULT_CC_BRIDGE_PIPELINE
  };
}
function getCcBridgeTransformsConfig() {
  return _runtimeConfig;
}
function resetCcBridgeTransformsConfig() {
  _runtimeConfig = DEFAULT_CC_BRIDGE_TRANSFORMS_CONFIG;
}
export {
  CCH_POSITIONS,
  CCH_SALT,
  CLAUDE_AGENT_SDK_IDENTITY,
  DEFAULT_CC_BRIDGE_PIPELINE,
  DEFAULT_CC_BRIDGE_TRANSFORMS_CONFIG,
  DEFAULT_CLAUDE_CODE_VERSION,
  DEFAULT_IDENTITY_PREFIXES,
  DEFAULT_PARAGRAPH_REMOVAL_ANCHORS,
  DEFAULT_TEXT_REPLACEMENTS,
  applyCcBridgeTransformPipeline,
  buildBillingHeaderValue,
  computeCchSha256FirstUser,
  computeDaystampVersionSuffix,
  computeExMachinaVersionSuffix,
  extractFirstUserMessageText,
  getCcBridgeTransformsConfig,
  resetCcBridgeTransformsConfig,
  setCcBridgeTransformsConfig
};
