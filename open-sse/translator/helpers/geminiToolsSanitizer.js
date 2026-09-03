import { createHash } from "crypto";
import { cleanJSONSchemaForAntigravity } from "./geminiHelper.js";
import { log as engineLog, sanitize } from "../../utils/log.js";
const MAX_GEMINI_TOOL_NAME_LENGTH = 64;
const GEMINI_TOOL_HASH_LENGTH = 8;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toGeminiParametersSchema(raw) {
  if (!isRecord(raw)) {
    return { type: "object", properties: {} };
  }
  if (raw.type === "object") {
    return raw;
  }
  return {
    ...raw,
    type: "object",
    properties: isRecord(raw.properties) ? raw.properties : {}
  };
}
function normalizeGeminiToolName(name, options = {}) {
  const trimmed = name.trim();
  const namespaceStripped = !options.stripNamespace ? trimmed : (() => {
    const namespaceIndex = trimmed.indexOf(":");
    return namespaceIndex >= 0 ? trimmed.slice(namespaceIndex + 1) : trimmed;
  })();
  return namespaceStripped.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}
function buildHashedGeminiToolName(baseName, originalName, hashLength) {
  const effectiveBase = baseName || "tool";
  const hash = createHash("sha256").update(originalName).digest("hex").slice(0, hashLength);
  const prefixLength = Math.max(1, MAX_GEMINI_TOOL_NAME_LENGTH - 1 - hash.length);
  return `${effectiveBase.slice(0, prefixLength)}_${hash}`;
}
function findSanitizedNameForOriginal(toolNameMap, originalName) {
  if (!(toolNameMap instanceof Map)) return null;
  for (const [sanitizedName, rawName] of toolNameMap.entries()) {
    if (rawName === originalName) {
      return sanitizedName;
    }
  }
  return null;
}
function isSanitizedNameTaken(toolNameMap, sanitizedName, originalName) {
  if (!(toolNameMap instanceof Map)) return false;
  const mappedOriginalName = toolNameMap.get(sanitizedName);
  return typeof mappedOriginalName === "string" && mappedOriginalName !== originalName;
}
function sanitizeGeminiToolName(name, options = {}) {
  const normalizedName = normalizeGeminiToolName(name, options) || "tool";
  const toolNameMap = options.toolNameMap instanceof Map ? options.toolNameMap : null;
  const existingSanitizedName = findSanitizedNameForOriginal(toolNameMap, name);
  if (existingSanitizedName) {
    return existingSanitizedName;
  }
  let sanitizedName = normalizedName.length <= MAX_GEMINI_TOOL_NAME_LENGTH ? normalizedName : buildHashedGeminiToolName(normalizedName, name, GEMINI_TOOL_HASH_LENGTH);
  if (isSanitizedNameTaken(toolNameMap, sanitizedName, name)) {
    const conflictingOriginalName = toolNameMap?.get(sanitizedName);
    sanitizedName = buildHashedGeminiToolName(normalizedName, name, GEMINI_TOOL_HASH_LENGTH);
    let hashLength = GEMINI_TOOL_HASH_LENGTH + 2;
    while (isSanitizedNameTaken(toolNameMap, sanitizedName, name) && hashLength <= 32) {
      sanitizedName = buildHashedGeminiToolName(normalizedName, name, hashLength);
      hashLength += 2;
    }
    if (isSanitizedNameTaken(toolNameMap, sanitizedName, name)) {
      sanitizedName = buildHashedGeminiToolName("tool", `${name}:${Date.now()}`, 12);
    }
    engineLog.warn(
      "GEMINI-TOOLS",
      sanitize(`Tool name collision after sanitization: "${name}" conflicts with "${conflictingOriginalName}". Using "${sanitizedName}".`)
    );
  }
  toolNameMap?.set(sanitizedName, name);
  return sanitizedName;
}
function toGeminiGoogleSearchTool(tool) {
  if (isRecord(tool.googleSearch)) {
    return { googleSearch: tool.googleSearch };
  }
  if (tool.googleSearch !== void 0) {
    return { googleSearch: {} };
  }
  if (isRecord(tool.google_search)) {
    return { googleSearch: tool.google_search };
  }
  if (tool.google_search !== void 0) {
    return { googleSearch: {} };
  }
  const toolType = typeof tool.type === "string" ? tool.type : "";
  if (toolType === "googleSearch" || toolType === "google_search" || toolType === "web_search" || toolType === "web_search_preview") {
    return { googleSearch: {} };
  }
  return null;
}
function buildGeminiTools(tools, options = {}) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return void 0;
  }
  const functionDeclarations = [];
  const seenToolNames = /* @__PURE__ */ new Set();
  let googleSearchTool = null;
  for (const rawTool of tools) {
    if (!isRecord(rawTool)) {
      continue;
    }
    const normalizedGoogleSearchTool = toGeminiGoogleSearchTool(rawTool);
    if (normalizedGoogleSearchTool) {
      googleSearchTool = normalizedGoogleSearchTool;
      continue;
    }
    if (Array.isArray(rawTool.functionDeclarations)) {
      for (const fn of rawTool.functionDeclarations) {
        if (!isRecord(fn) || typeof fn.name !== "string" || !fn.name.trim()) {
          continue;
        }
        const sanitizedName = sanitizeGeminiToolName(fn.name, options);
        if (seenToolNames.has(sanitizedName)) continue;
        seenToolNames.add(sanitizedName);
        functionDeclarations.push({
          name: sanitizedName,
          description: typeof fn.description === "string" ? fn.description : "",
          parameters: cleanJSONSchemaForAntigravity(toGeminiParametersSchema(fn.parameters))
        });
      }
      continue;
    }
    if (typeof rawTool.name === "string" && rawTool.name.trim()) {
      const sanitizedName = sanitizeGeminiToolName(rawTool.name, options);
      if (!seenToolNames.has(sanitizedName)) {
        seenToolNames.add(sanitizedName);
        functionDeclarations.push({
          name: sanitizedName,
          description: typeof rawTool.description === "string" ? rawTool.description : "",
          parameters: cleanJSONSchemaForAntigravity(toGeminiParametersSchema(rawTool.input_schema))
        });
      }
      continue;
    }
    if (rawTool.type === "function" && isRecord(rawTool.function)) {
      const fn = rawTool.function;
      if (typeof fn.name !== "string" || !fn.name.trim()) {
        continue;
      }
      const sanitizedName = sanitizeGeminiToolName(fn.name, options);
      if (!seenToolNames.has(sanitizedName)) {
        seenToolNames.add(sanitizedName);
        functionDeclarations.push({
          name: sanitizedName,
          description: typeof fn.description === "string" ? fn.description : "",
          parameters: cleanJSONSchemaForAntigravity(toGeminiParametersSchema(fn.parameters))
        });
      }
    }
  }
  const result = [];
  if (googleSearchTool) {
    return [googleSearchTool];
  }
  if (functionDeclarations.length > 0) {
    result.push({ functionDeclarations });
  }
  return result.length > 0 ? result : void 0;
}
export {
  buildGeminiTools,
  sanitizeGeminiToolName
};
