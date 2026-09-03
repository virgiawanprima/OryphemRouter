import {
  applyCcBridgeTransformPipeline,
  CLAUDE_AGENT_SDK_IDENTITY,
  DEFAULT_CC_BRIDGE_PIPELINE,
  DEFAULT_IDENTITY_PREFIXES,
  DEFAULT_PARAGRAPH_REMOVAL_ANCHORS,
  DEFAULT_TEXT_REPLACEMENTS
} from "./ccBridgeTransforms.js";
const DEFAULT_OBFUSCATE_WORDS = [
  // legacy hardcoded set
  "opencode",
  "open-code",
  "cline",
  "roo-cline",
  "roo_cline",
  "cursor",
  "windsurf",
  "aider",
  "continue.dev",
  "copilot",
  "avante",
  "codecompanion",
  // Open WebUI additions
  "openwebui",
  "open-webui"
  // Do not add "hermes" / "hermes-agent" here. #8350 is handled by
  // HERMES_PARAGRAPH_ANCHORS + HERMES_IDENTITY_PREFIXES (system-prompt
  // drops only). ZWJ on the short substring "hermes" rewrites user
  // messages and hostnames (#10484).
];
const OPENWEBUI_PARAGRAPH_ANCHORS = [
  "github.com/open-webui/open-webui",
  "openwebui.com",
  "docs.openwebui.com"
];
const OPENWEBUI_IDENTITY_PREFIXES = ["You are Open WebUI"];
const PI_PARAGRAPH_ANCHORS = [
  "@earendil-works/pi-coding-agent",
  "/.pi/",
  "Pi documentation (read only when the user asks about pi itself"
];
const HERMES_PARAGRAPH_ANCHORS = [
  "hermes-agent.nousresearch.com",
  "github.com/NousResearch/hermes-agent"
];
const HERMES_IDENTITY_PREFIXES = ["You are Hermes Agent"];
const PROVIDER_CLAUDE = "claude";
const PROVIDER_CC_BRIDGE = "anthropic-compatible-cc";
const DEFAULT_CLAUDE_PIPELINE = [
  // Drop paragraphs containing 3rd-party-agent anchors (anomalyco/opencode,
  // opencode.ai/docs, cline, getcursor/cursor, continue.dev, Open WebUI, Pi docs).
  {
    kind: "drop_paragraph_if_contains",
    needles: [
      ...DEFAULT_PARAGRAPH_REMOVAL_ANCHORS,
      ...OPENWEBUI_PARAGRAPH_ANCHORS,
      ...PI_PARAGRAPH_ANCHORS,
      ...HERMES_PARAGRAPH_ANCHORS
    ]
  },
  // Drop "You are OpenCode" + "You are Open WebUI" + "You are Hermes Agent"
  // identity paragraphs.
  {
    kind: "drop_paragraph_if_starts_with",
    prefixes: [
      ...DEFAULT_IDENTITY_PREFIXES,
      ...OPENWEBUI_IDENTITY_PREFIXES,
      ...HERMES_IDENTITY_PREFIXES
    ]
  },
  // Replace the "Here is some useful information about the environment you are
  // running in:" billing-gate trigger phrase + the "if OpenCode honestly"
  // phrase-shape filter (DEFAULT_TEXT_REPLACEMENTS from ccBridgeTransforms.ts).
  ...DEFAULT_TEXT_REPLACEMENTS.map((r) => ({
    kind: "replace_text",
    match: r.match,
    replacement: r.replacement,
    allOccurrences: true
  })),
  // ZWJ obfuscation of sensitive client words (opencode, cline, cursor, …,
  // openwebui). Layers on top of the legacy `obfuscateInBody` pass at
  // `executors/base.ts:622` (which only covers `DEFAULT_SENSITIVE_WORDS`).
  {
    kind: "obfuscate_words",
    words: [...DEFAULT_OBFUSCATE_WORDS],
    targets: ["system", "messages", "tools"]
  }
];
const DEFAULT_CC_BRIDGE_PROVIDER_PIPELINE = [
  // Extra Open WebUI anchors (the base pipeline only carries OpenCode/Cline/
  // Cursor/Continue anchors).
  {
    kind: "drop_paragraph_if_contains",
    needles: [...OPENWEBUI_PARAGRAPH_ANCHORS]
  },
  {
    kind: "drop_paragraph_if_starts_with",
    prefixes: [...OPENWEBUI_IDENTITY_PREFIXES]
  },
  // ZWJ obfuscate Open WebUI words across system+messages+tools.
  {
    kind: "obfuscate_words",
    words: ["openwebui", "open-webui"],
    targets: ["system", "messages", "tools"]
  },
  // Base CC bridge pipeline (anchors + identity prefixes + replacements +
  // prepend SDK identity + inject billing header).
  ...DEFAULT_CC_BRIDGE_PIPELINE
];
const DEFAULT_SYSTEM_TRANSFORMS_CONFIG = {
  providers: {
    [PROVIDER_CLAUDE]: {
      // Enabled by default — matches the module-level docstring ("claude:
      // obfuscate_words ON …") and closes the native-OAuth third-party-agent
      // leak that surfaces as `[400] Third-party apps now draw from extra
      // usage` when opencode (or any non-claude-cli client) hits OmniRoute's
      // `/v1/chat/completions` endpoint with a `claude/*` model slug. User
      // overrides via Settings UI (setSystemTransformsConfig) still win.
      enabled: true,
      pipeline: DEFAULT_CLAUDE_PIPELINE
    },
    [PROVIDER_CC_BRIDGE]: {
      enabled: true,
      pipeline: DEFAULT_CC_BRIDGE_PROVIDER_PIPELINE
    }
  }
};
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const ZWJ = "\u200D";
function obfuscateWord(word) {
  if (word.length <= 1) return word;
  return word[0] + ZWJ + word.slice(1);
}
const _obfuscationRegexCache = /* @__PURE__ */ new Map();
function getObfuscationRegex(word) {
  let regex = _obfuscationRegexCache.get(word);
  if (!regex) {
    if (_obfuscationRegexCache.size > 2e3) _obfuscationRegexCache.clear();
    regex = new RegExp(escapeRegex(word), "gi");
    _obfuscationRegexCache.set(word, regex);
  }
  return regex;
}
function obfuscateWithList(text, words) {
  if (!text || words.length === 0) return text;
  let result = text;
  for (const word of words) {
    if (!word) continue;
    const regex = getObfuscationRegex(word);
    result = result.replace(regex, (match) => obfuscateWord(match));
  }
  return result;
}
function applyObfuscateWords(body, op) {
  const words = op.words || [];
  if (words.length === 0) return;
  const targets = op.targets && op.targets.length > 0 ? op.targets : ["system", "messages", "tools"];
  if (targets.includes("system")) {
    if (typeof body.system === "string") {
      body.system = obfuscateWithList(body.system, words);
    } else if (Array.isArray(body.system)) {
      for (const block of body.system) {
        if (typeof block.text === "string") {
          block.text = obfuscateWithList(block.text, words);
        }
      }
    }
  }
  if (targets.includes("messages") && Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      const content = msg.content;
      if (typeof content === "string") {
        msg.content = obfuscateWithList(content, words);
      } else if (Array.isArray(content)) {
        const blocks = content;
        const hasSignedThinking = blocks.some(
          (block) => block?.type === "thinking" || block?.type === "redacted_thinking"
        );
        if (!hasSignedThinking) {
          for (const block of blocks) {
            if (typeof block.text === "string") {
              block.text = obfuscateWithList(block.text, words);
            }
          }
        }
      }
    }
  }
  if (targets.includes("tools") && Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (typeof tool.description === "string") {
        tool.description = obfuscateWithList(tool.description, words);
      }
      const fn = tool.function;
      if (fn && typeof fn.description === "string") {
        fn.description = obfuscateWithList(fn.description, words);
      }
    }
  }
}
function isObfuscateWordsOp(op) {
  return op.kind === "obfuscate_words";
}
function applyTransformPipeline(body, pipeline) {
  if (!body || typeof body !== "object") return { body, appliedOpKinds: [] };
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    return { body, appliedOpKinds: [] };
  }
  const appliedOpKinds = [];
  let baseRun = [];
  const flushBaseRun = () => {
    if (baseRun.length === 0) return;
    const config = { enabled: true, pipeline: baseRun };
    const result = applyCcBridgeTransformPipeline(
      body,
      config
    );
    appliedOpKinds.push(...result.appliedOpKinds);
    baseRun = [];
  };
  for (const op of pipeline) {
    if (isObfuscateWordsOp(op)) {
      flushBaseRun();
      applyObfuscateWords(body, op);
      appliedOpKinds.push(op.kind);
    } else {
      baseRun.push(op);
    }
  }
  flushBaseRun();
  return { body, appliedOpKinds };
}
function applySystemTransformPipeline(providerId, body, config = getSystemTransformsConfig()) {
  if (!body || typeof body !== "object") return { body, appliedOpKinds: [] };
  if (!config || !config.providers) return { body, appliedOpKinds: [] };
  const providerConfig = resolveProviderConfig(providerId, config);
  if (!providerConfig || !providerConfig.enabled) {
    return { body, appliedOpKinds: [] };
  }
  return applyTransformPipeline(body, providerConfig.pipeline);
}
function resolveProviderConfig(providerId, config) {
  if (!providerId) return void 0;
  const exact = config.providers[providerId];
  if (exact) return exact;
  if (providerId.startsWith(`${PROVIDER_CC_BRIDGE}-`) || providerId === PROVIDER_CC_BRIDGE) {
    return config.providers[PROVIDER_CC_BRIDGE];
  }
  return void 0;
}
const GLOBAL_KEY = "__omniroute_systemTransforms_config__";
const _store = globalThis;
function getStore() {
  if (!_store[GLOBAL_KEY]) {
    _store[GLOBAL_KEY] = DEFAULT_SYSTEM_TRANSFORMS_CONFIG;
  }
  return _store[GLOBAL_KEY];
}
function setSystemTransformsConfig(input) {
  if (!input || typeof input !== "object") {
    _store[GLOBAL_KEY] = DEFAULT_SYSTEM_TRANSFORMS_CONFIG;
    return;
  }
  const candidate = input;
  if ("pipeline" in candidate && Array.isArray(candidate.pipeline)) {
    _store[GLOBAL_KEY] = {
      providers: {
        ...DEFAULT_SYSTEM_TRANSFORMS_CONFIG.providers,
        [PROVIDER_CC_BRIDGE]: {
          enabled: candidate.enabled !== false,
          pipeline: candidate.pipeline
        }
      }
    };
    return;
  }
  if ("providers" in candidate && candidate.providers && typeof candidate.providers === "object") {
    const next = { providers: {} };
    const providers = candidate.providers;
    for (const [providerId, providerEntry] of Object.entries(providers)) {
      if (!providerEntry || typeof providerEntry !== "object") continue;
      const entry = providerEntry;
      next.providers[providerId] = {
        enabled: entry.enabled !== false,
        pipeline: Array.isArray(entry.pipeline) ? entry.pipeline : []
      };
    }
    for (const [providerId, providerDefault] of Object.entries(
      DEFAULT_SYSTEM_TRANSFORMS_CONFIG.providers
    )) {
      if (!next.providers[providerId]) {
        next.providers[providerId] = providerDefault;
      }
    }
    _store[GLOBAL_KEY] = next;
    return;
  }
  _store[GLOBAL_KEY] = DEFAULT_SYSTEM_TRANSFORMS_CONFIG;
}
function getSystemTransformsConfig() {
  return getStore();
}
function resetSystemTransformsConfig() {
  _store[GLOBAL_KEY] = DEFAULT_SYSTEM_TRANSFORMS_CONFIG;
}
export {
  CLAUDE_AGENT_SDK_IDENTITY,
  DEFAULT_CC_BRIDGE_PIPELINE,
  DEFAULT_CC_BRIDGE_PROVIDER_PIPELINE,
  DEFAULT_CLAUDE_PIPELINE,
  DEFAULT_IDENTITY_PREFIXES,
  DEFAULT_OBFUSCATE_WORDS,
  DEFAULT_PARAGRAPH_REMOVAL_ANCHORS,
  DEFAULT_SYSTEM_TRANSFORMS_CONFIG,
  DEFAULT_TEXT_REPLACEMENTS,
  HERMES_IDENTITY_PREFIXES,
  HERMES_PARAGRAPH_ANCHORS,
  OPENWEBUI_IDENTITY_PREFIXES,
  OPENWEBUI_PARAGRAPH_ANCHORS,
  PI_PARAGRAPH_ANCHORS,
  PROVIDER_CC_BRIDGE,
  PROVIDER_CLAUDE,
  applySystemTransformPipeline,
  applyTransformPipeline,
  getSystemTransformsConfig,
  resetSystemTransformsConfig,
  setSystemTransformsConfig
};
