const MAX_RECURSION_DEPTH = 32;
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function keepOpaqueObjectSchemasOpen(schema) {
  const explicitAdditionalProperties = hasOwn(schema, "additionalProperties");
  if (explicitAdditionalProperties) return;
  const properties = schema.properties;
  const isObjectSchema = schema.type === "object" || isPlainObject(properties);
  if (!isObjectSchema) return;
  if (properties === void 0) {
    schema.properties = {};
    schema.additionalProperties = true;
  } else if (isPlainObject(properties) && Object.keys(properties).length === 0) {
    schema.additionalProperties = true;
  }
}
function sanitizeSchema(value, depth = 0) {
  if (depth > MAX_RECURSION_DEPTH) return {};
  if (!isPlainObject(value)) return {};
  const result = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === void 0) continue;
    if (k === "properties" && isPlainObject(v)) {
      const cleaned = {};
      for (const [pk, pv] of Object.entries(v)) {
        if (isPlainObject(pv)) {
          cleaned[pk] = sanitizeSchema(pv, depth + 1);
        } else if (typeof pv === "boolean") {
          cleaned[pk] = pv;
        } else {
          cleaned[pk] = {};
        }
      }
      result[k] = cleaned;
    } else if (k === "items") {
      if (Array.isArray(v)) {
        const firstObject = v.find(isPlainObject);
        result[k] = firstObject ? sanitizeSchema(firstObject, depth + 1) : {};
      } else if (isPlainObject(v)) {
        result[k] = sanitizeSchema(v, depth + 1);
      }
    } else if (k === "anyOf" || k === "oneOf" || k === "allOf") {
      if (Array.isArray(v)) {
        result[k] = v.map((s) => isPlainObject(s) ? sanitizeSchema(s, depth + 1) : {});
      }
    } else if (k === "additionalProperties") {
      if (isPlainObject(v)) {
        result[k] = sanitizeSchema(v, depth + 1);
      } else if (typeof v === "boolean") {
        result[k] = v;
      }
    } else if (k === "enum" && Array.isArray(v)) {
      result[k] = v.filter((e) => e !== null && e !== void 0);
    } else if (k === "required" && Array.isArray(v)) {
      result[k] = v.filter((r) => typeof r === "string");
    } else {
      result[k] = v;
    }
  }
  if (Array.isArray(result.required) && isPlainObject(result.properties)) {
    const validKeys = new Set(Object.keys(result.properties));
    result.required = result.required.filter((r) => validKeys.has(r));
  }
  keepOpaqueObjectSchemasOpen(result);
  return result;
}
function ensureRootObjectType(schema) {
  if (hasOwn(schema, "type")) return;
  if (hasOwn(schema, "anyOf") || hasOwn(schema, "oneOf") || hasOwn(schema, "allOf")) return;
  schema.type = "object";
  if (!isPlainObject(schema.properties)) {
    schema.properties = {};
    if (!hasOwn(schema, "additionalProperties")) schema.additionalProperties = true;
  }
}
function normalizeParameters(parameters) {
  if (isPlainObject(parameters)) {
    const sanitized = sanitizeSchema(parameters);
    ensureRootObjectType(sanitized);
    return sanitized;
  }
  if (parameters === null || parameters === void 0) {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  return { type: "object", properties: {}, additionalProperties: true };
}
function sanitizeOpenAITool(tool) {
  if (!isPlainObject(tool)) return tool;
  const t = { ...tool };
  if (isPlainObject(t.function)) {
    const f = { ...t.function };
    f.parameters = normalizeParameters(f.parameters);
    t.function = f;
  } else if (t.type === "function") {
    t.parameters = normalizeParameters(t.parameters);
  }
  return t;
}
function sanitizeOpenAITools(tools) {
  return tools.map(sanitizeOpenAITool);
}
function flattenOpenAIToolRootAnyOf(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!isPlainObject(tool)) return tool;
    const next = { ...tool };
    const fn = isPlainObject(next.function) ? { ...next.function } : next;
    if (!isPlainObject(fn.parameters) || !hasOwn(fn.parameters, "anyOf")) return tool;
    const parameters = { ...fn.parameters };
    delete parameters.anyOf;
    fn.parameters = parameters;
    if (fn !== next) next.function = fn;
    return next;
  });
}
export {
  flattenOpenAIToolRootAnyOf,
  sanitizeOpenAITool,
  sanitizeOpenAITools
};
