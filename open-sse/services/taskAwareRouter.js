const TASK_PATTERNS = {
  coding: {
    patterns: [
      "write code",
      "write a function",
      "implement",
      "debug",
      "fix this",
      "fix the",
      "refactor",
      "unit test",
      "write test",
      "write a script",
      "code review",
      "complete this function",
      "add a feature",
      "javascript",
      "typescript",
      "python",
      "sql query",
      "api endpoint"
    ],
    userPatterns: [
      "```",
      "def ",
      "function ",
      "class ",
      "import ",
      "const ",
      "let ",
      "var ",
      "SELECT ",
      "INSERT ",
      "<html",
      "<div"
    ]
  },
  creative: {
    patterns: [
      "write a story",
      "write a poem",
      "write a song",
      "creative writing",
      "write a blog",
      "write an article",
      "write a script",
      "write an essay",
      "imagine",
      "roleplay",
      "brainstorm",
      "creative"
    ]
  },
  analysis: {
    patterns: [
      "analyze",
      "analyse",
      "analysis",
      "compare",
      "evaluate",
      "assess",
      "explain",
      "reasoning",
      "pros and cons",
      "advantages and disadvantages",
      "what are the implications",
      "in-depth",
      "comprehensive"
    ]
  },
  vision: {
    patterns: [
      "look at this image",
      "in this image",
      "what do you see",
      "describe this image",
      "analyze this image",
      "read this screenshot"
    ],
    userPatterns: ["image_url", "data:image"]
  },
  summarization: {
    patterns: [
      "summarize",
      "summary",
      "tldr",
      "tl;dr",
      "brief overview",
      "key points",
      "main points",
      "what did",
      "highlights from"
    ]
  },
  background: {
    patterns: [
      "generate a title",
      "generate title",
      "create a title",
      "name this",
      "short description",
      "brief description",
      "one-line summary",
      "conversation title"
    ]
  },
  chat: {
    patterns: []
  }
};
const DEFAULT_TASK_MODEL_MAP = {
  coding: "auto/coding",
  // Best-scoring connected coding model
  creative: "",
  // No override — use requested model
  analysis: "auto/reasoning",
  // Reasoning-capable candidates only
  vision: "auto/vision",
  // Vision-capable candidates only
  summarization: "auto/chat:fast",
  // Latency-weighted pack
  background: "auto/chat:cheap",
  // Cost-weighted pack for utility traffic
  chat: ""
  // No override — use requested model
};
const GLOBAL_KEY = "__omniroute_taskRouting_config__";
const _store = globalThis;
function freshConfig() {
  return {
    enabled: false,
    // User must explicitly enable
    taskModelMap: { ...DEFAULT_TASK_MODEL_MAP },
    detectionEnabled: true,
    stats: { detected: 0, routed: 0 }
  };
}
function getConfig() {
  if (!_store[GLOBAL_KEY]) {
    _store[GLOBAL_KEY] = freshConfig();
  }
  return _store[GLOBAL_KEY];
}
function setTaskRoutingConfig(config) {
  const current = getConfig();
  _store[GLOBAL_KEY] = {
    ...current,
    ...config,
    stats: current.stats
    // preserve stats across config changes
  };
}
function getTaskRoutingConfig() {
  const current = getConfig();
  return {
    ...current,
    taskModelMap: { ...current.taskModelMap },
    stats: { ...current.stats }
  };
}
function resetTaskRoutingStats() {
  getConfig().stats = { detected: 0, routed: 0 };
}
function hydrateTaskRoutingConfig(settings) {
  const raw = settings && typeof settings === "object" && !Array.isArray(settings) ? settings.taskRouting : void 0;
  if (raw === void 0 || raw === null) return false;
  let parsed = raw;
  if (typeof raw === "string") {
    if (raw.trim().length === 0) return false;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const { stats: _ignoredStats, ...persisted } = parsed;
  setTaskRoutingConfig(persisted);
  return true;
}
function getDefaultTaskModelMap() {
  return { ...DEFAULT_TASK_MODEL_MAP };
}
function getDefaultTaskPatterns() {
  return Object.fromEntries(
    Object.entries(TASK_PATTERNS).map(([taskType, { patterns, userPatterns }]) => [
      taskType,
      { patterns: [...patterns], ...userPatterns ? { userPatterns: [...userPatterns] } : {} }
    ])
  );
}
function extractText(content) {
  if (typeof content === "string") return content.toLowerCase();
  if (Array.isArray(content)) {
    return content.map(
      (part) => typeof part === "string" ? part.toLowerCase() : part?.text?.toLowerCase() || ""
    ).join(" ");
  }
  return "";
}
function hasImages(messages) {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === "image_url" || part?.type === "image") return true;
      }
    }
  }
  return false;
}
function detectTaskType(body) {
  if (!body || typeof body !== "object") return "chat";
  const messages = Array.isArray(body.messages) ? body.messages : Array.isArray(body.input) ? body.input : [];
  if (messages.length === 0) return "chat";
  if (hasImages(messages)) return "vision";
  const systemMsg = messages.find((m) => m.role === "system" || m.role === "developer");
  const systemText = systemMsg ? extractText(systemMsg.content) : "";
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg ? extractText(lastUserMsg.content) : "";
  const priorityOrder = [
    "background",
    "coding",
    "vision",
    "summarization",
    "analysis",
    "creative"
  ];
  const overrides = getConfig().patternOverrides;
  for (const taskType of priorityOrder) {
    const defaults = TASK_PATTERNS[taskType];
    const override = overrides?.[taskType];
    const patterns = override?.patterns ?? defaults.patterns;
    const userPatterns = override?.userPatterns ?? defaults.userPatterns;
    if (patterns.some((p) => systemText.includes(p.toLowerCase()))) {
      return taskType;
    }
    if (patterns.some((p) => userText.includes(p.toLowerCase()))) {
      return taskType;
    }
    if (userPatterns?.some((p) => userText.includes(p.toLowerCase()))) {
      return taskType;
    }
  }
  return "chat";
}
function applyTaskAwareRouting(originalModel, body) {
  const config = getConfig();
  if (!config.enabled || !config.detectionEnabled) {
    return { model: originalModel, taskType: "chat", wasRouted: false };
  }
  const taskType = detectTaskType(body);
  config.stats.detected++;
  const preferred = config.taskModelMap[taskType];
  if (!preferred || preferred === "") {
    return { model: originalModel, taskType, wasRouted: false };
  }
  if (taskType !== "background" && taskType !== "summarization") {
  }
  config.stats.routed++;
  return { model: preferred, taskType, wasRouted: true };
}
export {
  applyTaskAwareRouting,
  detectTaskType,
  getDefaultTaskModelMap,
  getDefaultTaskPatterns,
  getTaskRoutingConfig,
  hydrateTaskRoutingConfig,
  resetTaskRoutingStats,
  setTaskRoutingConfig
};
