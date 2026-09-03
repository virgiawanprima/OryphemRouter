import { createHash } from "node:crypto";
const MAX_TOOL_NAME_LENGTH = 64;
const STRIP_KEYS = /* @__PURE__ */ new Set([
  "additionalProperties",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "definitions",
  "if",
  "then",
  "else",
  "unevaluatedProperties",
  "unevaluatedItems",
  "contentEncoding",
  "contentMediaType"
]);
function stripKeys(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripKeys);
  const cleaned = {};
  for (const [key, val] of Object.entries(value)) {
    if (STRIP_KEYS.has(key)) continue;
    if (key === "required" && Array.isArray(val) && val.length === 0) continue;
    cleaned[key] = stripKeys(val);
  }
  return cleaned;
}
function sanitizeKiroTools(tools) {
  const nameMap = /* @__PURE__ */ new Map();
  if (!tools || !Array.isArray(tools)) {
    return { tools, nameMap };
  }
  const sanitized = tools.map((tool) => {
    const spec = tool?.toolSpecification;
    if (!spec) return tool;
    const originalName = spec.name;
    let name = originalName;
    if (typeof name === "string" && name.length > MAX_TOOL_NAME_LENGTH) {
      const hash = createHash("sha256").update(name).digest("hex").slice(0, 7);
      name = `${name.slice(0, 56)}_${hash}`;
      nameMap.set(name, originalName);
    }
    const schema = spec.inputSchema?.json;
    if (schema && typeof schema === "object" && !Array.isArray(schema)) {
      const cleaned = stripKeys(schema);
      if (!cleaned.required) {
        cleaned.required = [];
      }
      return {
        ...tool,
        toolSpecification: {
          ...spec,
          name,
          inputSchema: { json: cleaned }
        }
      };
    }
    return {
      ...tool,
      toolSpecification: { ...spec, name }
    };
  });
  return { tools: sanitized, nameMap };
}
export {
  sanitizeKiroTools
};
