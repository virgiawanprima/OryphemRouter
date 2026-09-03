import { log } from "../utils/log.js";
const BROWSER_KEYWORDS = [
  "browser",
  "playwright",
  "puppeteer",
  "screenshot",
  "navigate",
  "click",
  "form",
  "page",
  "tab",
  "window",
  "computer_use",
  "computer-use"
];
const HIGH_COMPLEXITY_KEYWORDS = [
  "deploy",
  "migration",
  "security",
  "auth",
  "database",
  "refactor",
  "production",
  "incident"
];
function detectVolumeSignals(body) {
  const messages = body.messages || body.input || [];
  const tools = body.tools || [];
  const toolCount = tools.length;
  let batchSize = 1;
  if (Array.isArray(body.input) && body.input.length > 1) {
    batchSize = body.input.length;
  } else if (Array.isArray(messages)) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && Array.isArray(lastMsg.content)) {
      const contentParts = lastMsg.content;
      batchSize = Math.max(1, contentParts.length);
    }
  }
  const serialized = JSON.stringify(messages);
  const estimatedTokens = Math.ceil(serialized.length / 4);
  const lowerSerialized = serialized.toLowerCase();
  const hasBrowser = BROWSER_KEYWORDS.some((kw) => lowerSerialized.includes(kw));
  const hasImages = lowerSerialized.includes("image_url") || lowerSerialized.includes("image/") || lowerSerialized.includes("base64") || lowerSerialized.includes("screenshot");
  const hasHighKeywords = HIGH_COMPLEXITY_KEYWORDS.some((kw) => lowerSerialized.includes(kw));
  let complexity;
  if (toolCount > 3 || hasBrowser && toolCount > 1 || hasHighKeywords) {
    complexity = "critical";
  } else if (toolCount > 1 || hasBrowser || hasImages || estimatedTokens > 1e4) {
    complexity = "high";
  } else if (toolCount === 1 || estimatedTokens > 2e3) {
    complexity = "medium";
  } else if (estimatedTokens > 500) {
    complexity = "low";
  } else {
    complexity = "trivial";
  }
  return {
    batchSize,
    estimatedTokens,
    toolCount,
    hasBrowser,
    hasImages,
    complexity
  };
}
async function recommendStrategyOverride(signals, currentStrategy) {
  const noOverride = {
    shouldOverride: false,
    strategy: null,
    preferEconomy: false,
    forcePremium: false,
    reason: "no override needed"
  };
  try {
    const { getSettings } = await import("../utils/omni/localDbKeys.js");
    const settings = await getSettings();
    if (!settings.adaptiveVolumeRouting) {
      return noOverride;
    }
  } catch (error) {
    log.error("VOLUME-DETECTOR", "Failed to check adaptiveVolumeRouting setting:", error);
    return noOverride;
  }
  if (signals.batchSize >= 50) {
    return {
      shouldOverride: true,
      strategy: "round-robin",
      preferEconomy: true,
      forcePremium: false,
      reason: `batch size ${signals.batchSize} >= 50: distribute load via round-robin with economy models`
    };
  }
  if (signals.batchSize >= 10 && signals.complexity === "low") {
    return {
      shouldOverride: currentStrategy !== "cost-optimized",
      strategy: "cost-optimized",
      preferEconomy: true,
      forcePremium: false,
      reason: `batch size ${signals.batchSize} with low complexity: use cost-optimized routing`
    };
  }
  if (signals.complexity === "critical") {
    return {
      shouldOverride: true,
      strategy: "priority",
      preferEconomy: false,
      forcePremium: true,
      reason: `critical complexity (tools=${signals.toolCount}, browser=${signals.hasBrowser}): force premium-first priority`
    };
  }
  if (signals.hasBrowser) {
    return {
      shouldOverride: currentStrategy !== "priority",
      strategy: "priority",
      preferEconomy: false,
      forcePremium: true,
      reason: "browser/UI interaction detected: force premium-first priority"
    };
  }
  if (signals.estimatedTokens <= 200) {
    return {
      shouldOverride: false,
      strategy: null,
      preferEconomy: true,
      forcePremium: false,
      reason: `short request (${signals.estimatedTokens} tokens): prefer economy tier`
    };
  }
  return noOverride;
}
export {
  detectVolumeSignals,
  recommendStrategyOverride
};
