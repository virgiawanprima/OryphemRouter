function normalizeToolName(value) {
  return typeof value === "string" ? value.trim() : "";
}
const STRIPPABLE_EMPTY_ARG_TOOLS = /* @__PURE__ */ new Set(["Read", "Subagent"]);
function jsonValuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
function hasUsableSchema(schema) {
  return !!(schema && typeof schema === "object" && !Array.isArray(schema));
}
function schemaProperties(schema) {
  return hasUsableSchema(schema) && schema.properties && typeof schema.properties === "object" ? schema.properties : null;
}
function schemaRequiredSet(schema) {
  return new Set(hasUsableSchema(schema) && Array.isArray(schema.required) ? schema.required : []);
}
function isEmptyToolArgValue(entry) {
  return entry === "" || Array.isArray(entry) && entry.length === 0;
}
function matchesSchemaDefault(propSchema, entry) {
  if (!propSchema || !Object.prototype.hasOwnProperty.call(propSchema, "default")) return false;
  return jsonValuesEqual(entry, propSchema.default);
}
function isDroppableEmptyEntry(entry, propSchema, required, key, allowlisted) {
  if (!isEmptyToolArgValue(entry)) return false;
  return allowlisted || propSchema != null && !required.has(key);
}
function schemaTypeIncludes(type, wanted) {
  return type === wanted || Array.isArray(type) && type.includes(wanted);
}
function hasOmissionSentinel(propSchema) {
  if (!propSchema || typeof propSchema !== "object") return false;
  if (typeof propSchema.description !== "string" || !propSchema.description.includes("null = omit this parameter")) {
    return false;
  }
  return schemaTypeIncludes(propSchema.type, "null") || Array.isArray(propSchema.enum) && propSchema.enum.includes(null);
}
function isDroppableNullEntry(entry, propSchema, required, key, toolName) {
  if (entry !== null) return false;
  if (toolName === "Agent") return true;
  if (propSchema == null) return false;
  return !required.has(key) || hasOmissionSentinel(propSchema);
}
function stripEmptyOptionalToolArgsObject(value, toolName, schema) {
  const properties = schemaProperties(schema);
  const required = schemaRequiredSet(schema);
  const allowlisted = STRIPPABLE_EMPTY_ARG_TOOLS.has(toolName);
  const cleaned = { ...value };
  for (const [key, entry] of Object.entries(cleaned)) {
    const propSchema = properties ? properties[key] : null;
    if (matchesSchemaDefault(propSchema, entry) || isDroppableEmptyEntry(entry, propSchema, required, key, allowlisted) || isDroppableNullEntry(entry, propSchema, required, key, toolName)) {
      delete cleaned[key];
    }
  }
  return cleaned;
}
function stripEmptyOptionalToolArgs(value, toolName, schema) {
  if (value == null) return value;
  if (typeof value === "string") {
    if (!hasUsableSchema(schema) && !STRIPPABLE_EMPTY_ARG_TOOLS.has(toolName) && toolName !== "Agent") {
      return value;
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) || typeof parsed !== "object" || parsed === null) return value;
      const cleaned = stripEmptyOptionalToolArgs(parsed, toolName, schema);
      return JSON.stringify(cleaned ?? {});
    } catch {
      return value;
    }
  }
  if (Array.isArray(value) || typeof value !== "object") return value;
  return stripEmptyOptionalToolArgsObject(value, toolName, schema);
}
function normalizeOutputIndex(outputIndex) {
  const normalized = Number(outputIndex);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 0;
}
function normalizeUpstreamFailure(data, fallbackType = "server_error") {
  const response = data?.response && typeof data.response === "object" ? data.response : null;
  const error = response?.error && typeof response.error === "object" ? response.error : data?.error && typeof data.error === "object" ? data.error : null;
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : typeof data?.message === "string" ? data.message : "Upstream failure";
  const isContextOverflow = code === "context_length_exceeded";
  const isRateLimit = code === "rate_limit_exceeded" || code === "rate_limited";
  let status;
  let type;
  if (isRateLimit) {
    status = 429;
    type = "rate_limit_error";
  } else if (isContextOverflow) {
    status = 400;
    type = "invalid_request_error";
  } else {
    status = 502;
    type = fallbackType;
  }
  return {
    status,
    type,
    code: code || (isRateLimit ? "rate_limit_exceeded" : "bad_gateway"),
    message
  };
}
function extractResponsesReasoningSummaryText(item) {
  if (!item || !Array.isArray(item.summary)) return "";
  return item.summary.map(
    (part) => part && typeof part === "object" && typeof part.text === "string" ? part.text : ""
  ).filter((text) => text.length > 0).join("\n\n");
}
function getVisibleResponsesReasoningSummaryText(item) {
  return extractResponsesReasoningSummaryText(item);
}
export {
  extractResponsesReasoningSummaryText,
  getVisibleResponsesReasoningSummaryText,
  normalizeOutputIndex,
  normalizeToolName,
  normalizeUpstreamFailure,
  stripEmptyOptionalToolArgs
};
