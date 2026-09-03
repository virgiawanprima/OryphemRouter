import { FORMATS } from "../translator/formats.js";
const OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME = "omniroute_web_search";
const WEB_SEARCH_TOOL_TYPES = /^web_search/;
const SEARCH_CONTEXT_DEFAULTS = {
  low: 5,
  medium: 8,
  high: 10
};
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function isBuiltInWebSearchTool(tool) {
  const toolRecord = toRecord(tool);
  const toolType = typeof toolRecord.type === "string" ? toolRecord.type : "";
  return WEB_SEARCH_TOOL_TYPES.test(toolType) && !toolRecord.function;
}
function isBuiltInWebSearchToolChoice(toolChoice) {
  const choice = toRecord(toolChoice);
  const toolType = typeof choice.type === "string" ? choice.type : "";
  return WEB_SEARCH_TOOL_TYPES.test(toolType);
}
function buildFallbackDescription(tool) {
  const externalWebAccess = tool.external_web_access !== false;
  const contextSize = typeof tool.search_context_size === "string" ? tool.search_context_size.trim().toLowerCase() : "";
  const defaultMaxResults = SEARCH_CONTEXT_DEFAULTS[contextSize] || SEARCH_CONTEXT_DEFAULTS.medium;
  const accessMode = externalWebAccess ? "public web" : "configured search index";
  return [
    `Search the ${accessMode} for recent, factual information and return cited results.`,
    "Use this when the answer depends on current events, external documents, or fresh facts.",
    `If max_results is omitted, prefer about ${defaultMaxResults} results.`
  ].join(" ");
}
function buildFallbackParameters(tool) {
  const contextSize = typeof tool.search_context_size === "string" ? tool.search_context_size.trim().toLowerCase() : "";
  const defaultMaxResults = SEARCH_CONTEXT_DEFAULTS[contextSize] || SEARCH_CONTEXT_DEFAULTS.medium;
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      query: {
        type: "string",
        description: "The web search query to execute."
      },
      search_type: {
        type: "string",
        enum: ["web", "news"],
        description: "Use 'news' for recent headlines or reporting; otherwise use 'web'."
      },
      max_results: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        default: defaultMaxResults,
        description: "Maximum number of results to retrieve."
      },
      country: {
        type: "string",
        description: "Optional 2-letter country code for localization, e.g. US or BR."
      },
      language: {
        type: "string",
        description: "Optional language code such as en or pt-BR."
      },
      time_range: {
        type: "string",
        enum: ["any", "day", "week", "month", "year"],
        description: "Optional recency filter."
      },
      filters: {
        type: "object",
        additionalProperties: false,
        properties: {
          include_domains: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of domains to include."
          },
          exclude_domains: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of domains to exclude."
          }
        }
      }
    },
    required: ["query"]
  };
}
function buildFallbackTool(tool, targetFormat) {
  const name = OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME;
  const description = buildFallbackDescription(tool);
  const parameters = buildFallbackParameters(tool);
  if (targetFormat === FORMATS.OPENAI_RESPONSES) {
    return { type: "function", name, description, parameters };
  }
  return {
    type: "function",
    function: { name, description, parameters }
  };
}
const CLAUDE_FORMAT_PROVIDERS_WITHOUT_SERVER_TOOLS = /* @__PURE__ */ new Set(["minimax"]);
function supportsNativeWebSearchFallbackBypass({
  provider,
  sourceFormat,
  targetFormat,
  nativeCodexPassthrough,
  interceptSearchOverride
}) {
  if (typeof interceptSearchOverride === "boolean") {
    return !interceptSearchOverride;
  }
  if (nativeCodexPassthrough) return true;
  if (targetFormat === FORMATS.GEMINI) return true;
  if (sourceFormat === FORMATS.CLAUDE && targetFormat === FORMATS.CLAUDE) {
    if (provider && CLAUDE_FORMAT_PROVIDERS_WITHOUT_SERVER_TOOLS.has(provider)) return false;
    return true;
  }
  return false;
}
function prepareWebSearchFallbackBody(body, options) {
  const tools = Array.isArray(body.tools) ? body.tools : null;
  if (!tools || tools.length === 0) {
    return {
      body,
      fallback: { enabled: false, toolName: null, convertedToolCount: 0 }
    };
  }
  const builtInSearchTools = tools.filter(isBuiltInWebSearchTool);
  if (builtInSearchTools.length === 0) {
    return {
      body,
      fallback: { enabled: false, toolName: null, convertedToolCount: 0 }
    };
  }
  if (supportsNativeWebSearchFallbackBypass(options)) {
    return {
      body,
      fallback: { enabled: false, toolName: null, convertedToolCount: 0 }
    };
  }
  const toolNames = /* @__PURE__ */ new Set();
  const preservedTools = tools.filter((tool) => {
    if (isBuiltInWebSearchTool(tool)) return false;
    const toolRecord = toRecord(tool);
    const functionRecord = toRecord(toolRecord.function);
    const name = typeof functionRecord.name === "string" ? functionRecord.name : typeof toolRecord.name === "string" ? toolRecord.name : "";
    if (name.trim().length > 0) {
      toolNames.add(name.trim());
    }
    return true;
  });
  const isResponsesTarget = options.targetFormat === FORMATS.OPENAI_RESPONSES;
  if (!toolNames.has(OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME)) {
    preservedTools.unshift(
      buildFallbackTool(toRecord(builtInSearchTools[0]), options.targetFormat)
    );
  }
  const nextBody = {
    ...body,
    tools: preservedTools
  };
  if (isBuiltInWebSearchToolChoice(body.tool_choice)) {
    nextBody.tool_choice = isResponsesTarget ? { type: "function", name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME } : { type: "function", function: { name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME } };
  }
  return {
    body: nextBody,
    fallback: {
      enabled: true,
      toolName: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME,
      convertedToolCount: builtInSearchTools.length
    }
  };
}
export {
  OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME,
  prepareWebSearchFallbackBody,
  supportsNativeWebSearchFallbackBypass
};
