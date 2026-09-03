import { FORMATS } from "../translator/formats.js";
const OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME = "omniroute_web_fetch";
const WEB_FETCH_TOOL_TYPES = /* @__PURE__ */ new Set(["web_fetch", "web_fetch_20250910"]);
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function isBuiltInWebFetchTool(tool) {
  const toolRecord = toRecord(tool);
  const toolType = typeof toolRecord.type === "string" ? toolRecord.type : "";
  return WEB_FETCH_TOOL_TYPES.has(toolType) && !toolRecord.function;
}
function isBuiltInWebFetchToolChoice(toolChoice) {
  const choice = toRecord(toolChoice);
  const toolType = typeof choice.type === "string" ? choice.type : "";
  return WEB_FETCH_TOOL_TYPES.has(toolType);
}
function buildFallbackParameters() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch and extract content from."
      },
      format: {
        type: "string",
        enum: ["markdown", "html", "links", "screenshot"],
        description: "Desired output format. Defaults to markdown."
      },
      include_metadata: {
        type: "boolean",
        description: "Whether to include page metadata (title, description) in the result."
      }
    },
    required: ["url"]
  };
}
function buildFallbackTool(targetFormat) {
  const name = OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME;
  const description = [
    "Fetch and extract the content of a specific URL.",
    "Use this when the user references a URL or asks you to read or summarize a specific page."
  ].join(" ");
  const parameters = buildFallbackParameters();
  if (targetFormat === FORMATS.OPENAI_RESPONSES) {
    return { type: "function", name, description, parameters };
  }
  return {
    type: "function",
    function: { name, description, parameters }
  };
}
function supportsNativeWebFetchFallbackBypass({
  interceptFetchOverride
}) {
  return interceptFetchOverride !== true;
}
function prepareWebFetchFallbackBody(body, options) {
  const tools = Array.isArray(body.tools) ? body.tools : null;
  if (!tools || tools.length === 0) {
    return {
      body,
      fallback: { enabled: false, toolName: null, convertedToolCount: 0 }
    };
  }
  const builtInFetchTools = tools.filter(isBuiltInWebFetchTool);
  if (builtInFetchTools.length === 0) {
    return {
      body,
      fallback: { enabled: false, toolName: null, convertedToolCount: 0 }
    };
  }
  if (supportsNativeWebFetchFallbackBypass(options)) {
    return {
      body,
      fallback: { enabled: false, toolName: null, convertedToolCount: 0 }
    };
  }
  const toolNames = /* @__PURE__ */ new Set();
  const preservedTools = tools.filter((tool) => {
    if (isBuiltInWebFetchTool(tool)) return false;
    const toolRecord = toRecord(tool);
    const functionRecord = toRecord(toolRecord.function);
    const name = typeof functionRecord.name === "string" ? functionRecord.name : typeof toolRecord.name === "string" ? toolRecord.name : "";
    if (name.trim().length > 0) {
      toolNames.add(name.trim());
    }
    return true;
  });
  const isResponsesTarget = options.targetFormat === FORMATS.OPENAI_RESPONSES;
  if (!toolNames.has(OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME)) {
    preservedTools.unshift(buildFallbackTool(options.targetFormat));
  }
  const nextBody = {
    ...body,
    tools: preservedTools
  };
  if (isBuiltInWebFetchToolChoice(body.tool_choice)) {
    nextBody.tool_choice = isResponsesTarget ? { type: "function", name: OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME } : { type: "function", function: { name: OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME } };
  }
  return {
    body: nextBody,
    fallback: {
      enabled: true,
      toolName: OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME,
      convertedToolCount: builtInFetchTools.length
    }
  };
}
export {
  OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME,
  prepareWebFetchFallbackBody,
  supportsNativeWebFetchFallbackBypass
};
