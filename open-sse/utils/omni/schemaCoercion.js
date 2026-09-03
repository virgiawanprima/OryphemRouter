import {
  requiresReasoningReplay
} from "./reasoningCacheStub.js";
const NUMERIC_SCHEMA_FIELDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "multipleOf"
];
const REGEX_LOOKAROUND_PATTERN = /\(\?<?[=!]/;
function hasUnsupportedRegexLookaround(pattern) {
  return typeof pattern === "string" && REGEX_LOOKAROUND_PATTERN.test(pattern);
}
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function keepOpaqueObjectSchemasOpen(schema) {
  if (hasOwn(schema, "additionalProperties")) return;
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
function coerceNumericString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}
function mapRecordValues(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, coerceSchemaNumericFields(value)])
  );
}
function sanitizeDescriptionValue(value) {
  if (value === void 0) return void 0;
  if (value === null) return "";
  return typeof value === "string" ? value : String(value);
}
function coerceSchemaNumericFields(schema) {
  if (Array.isArray(schema)) {
    return schema.map((entry) => coerceSchemaNumericFields(entry));
  }
  if (!isPlainObject(schema)) return schema;
  const result = { ...schema };
  if ("default" in result) {
    delete result.default;
  }
  if (hasUnsupportedRegexLookaround(result.pattern)) {
    delete result.pattern;
  }
  for (const field of NUMERIC_SCHEMA_FIELDS) {
    if (field in result) {
      result[field] = coerceNumericString(result[field]);
    }
  }
  if (isPlainObject(result.properties)) {
    result.properties = mapRecordValues(result.properties);
  }
  if (isPlainObject(result.patternProperties)) {
    result.patternProperties = mapRecordValues(result.patternProperties);
  }
  if (isPlainObject(result.definitions)) {
    result.definitions = mapRecordValues(result.definitions);
  }
  if (isPlainObject(result.$defs)) {
    result.$defs = mapRecordValues(result.$defs);
  }
  if (isPlainObject(result.dependentSchemas)) {
    result.dependentSchemas = mapRecordValues(result.dependentSchemas);
  }
  if (result.items !== void 0) {
    result.items = coerceSchemaNumericFields(result.items);
  }
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = coerceSchemaNumericFields(result.additionalProperties);
  }
  if (result.unevaluatedProperties && typeof result.unevaluatedProperties === "object") {
    result.unevaluatedProperties = coerceSchemaNumericFields(result.unevaluatedProperties);
  }
  if (Array.isArray(result.prefixItems)) {
    result.prefixItems = result.prefixItems.map((entry) => coerceSchemaNumericFields(entry));
  }
  if (Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map((entry) => coerceSchemaNumericFields(entry));
  }
  if (Array.isArray(result.oneOf)) {
    result.oneOf = result.oneOf.map((entry) => coerceSchemaNumericFields(entry));
  }
  if (Array.isArray(result.allOf)) {
    result.allOf = result.allOf.map((entry) => coerceSchemaNumericFields(entry));
  }
  if (isPlainObject(result.not)) {
    result.not = coerceSchemaNumericFields(result.not);
  }
  if (isPlainObject(result.if)) {
    result.if = coerceSchemaNumericFields(result.if);
  }
  if (isPlainObject(result.then)) {
    result.then = coerceSchemaNumericFields(result.then);
  }
  if (isPlainObject(result.else)) {
    result.else = coerceSchemaNumericFields(result.else);
  }
  keepOpaqueObjectSchemasOpen(result);
  return result;
}
const REGEX_STRIP_OBJECT_MAP_FIELDS = [
  "properties",
  "patternProperties",
  "definitions",
  "$defs"
];
const REGEX_STRIP_ARRAY_MAP_FIELDS = ["prefixItems", "anyOf", "oneOf", "allOf"];
function stripRegexFromObjectMap(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, stripUnsupportedRegexPatterns(value)])
  );
}
function stripUnsupportedRegexPatterns(schema) {
  if (Array.isArray(schema)) {
    return schema.map((entry) => stripUnsupportedRegexPatterns(entry));
  }
  if (!isPlainObject(schema)) return schema;
  const result = { ...schema };
  if (hasUnsupportedRegexLookaround(result.pattern)) {
    delete result.pattern;
  }
  for (const field of REGEX_STRIP_OBJECT_MAP_FIELDS) {
    if (isPlainObject(result[field])) {
      result[field] = stripRegexFromObjectMap(result[field]);
    }
  }
  for (const field of REGEX_STRIP_ARRAY_MAP_FIELDS) {
    if (Array.isArray(result[field])) {
      result[field] = result[field].map(
        (entry) => stripUnsupportedRegexPatterns(entry)
      );
    }
  }
  if (result.items !== void 0) {
    result.items = stripUnsupportedRegexPatterns(result.items);
  }
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = stripUnsupportedRegexPatterns(result.additionalProperties);
  }
  if (isPlainObject(result.not)) {
    result.not = stripUnsupportedRegexPatterns(result.not);
  }
  return result;
}
function sanitizeToolDescription(tool) {
  if (!isPlainObject(tool)) return tool;
  const result = { ...tool };
  if (isPlainObject(result.function) && "description" in result.function) {
    const description = sanitizeDescriptionValue(result.function.description);
    if (description !== void 0) {
      result.function = { ...result.function, description };
    }
  }
  if (!isPlainObject(result.function) && "description" in result) {
    const description = sanitizeDescriptionValue(result.description);
    if (description !== void 0) {
      result.description = description;
    }
  }
  if (Array.isArray(result.functionDeclarations)) {
    result.functionDeclarations = result.functionDeclarations.map((declaration) => {
      if (!isPlainObject(declaration) || !("description" in declaration)) return declaration;
      const description = sanitizeDescriptionValue(declaration.description);
      return description === void 0 ? declaration : { ...declaration, description };
    });
  }
  return result;
}
function coerceToolSchemas(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!isPlainObject(tool)) return tool;
    const result = { ...tool };
    if (isPlainObject(result.function) && "parameters" in result.function) {
      result.function = {
        ...result.function,
        parameters: coerceSchemaNumericFields(result.function.parameters)
      };
    }
    if (result.input_schema !== void 0) {
      result.input_schema = coerceSchemaNumericFields(result.input_schema);
    }
    if ("parameters" in result && !isPlainObject(result.function)) {
      result.parameters = coerceSchemaNumericFields(result.parameters);
    }
    if (Array.isArray(result.functionDeclarations)) {
      result.functionDeclarations = result.functionDeclarations.map((declaration) => {
        if (!isPlainObject(declaration) || !("parameters" in declaration)) return declaration;
        return {
          ...declaration,
          parameters: coerceSchemaNumericFields(declaration.parameters)
        };
      });
    }
    return result;
  });
}
const NULL_OMISSION_NOTE = "null = omit this parameter";
function schemaTypeIncludes(type, wanted) {
  return type === wanted || Array.isArray(type) && type.includes(wanted);
}
function isPlainStringType(type) {
  return type === "string" || Array.isArray(type) && type.length === 1 && type[0] === "string";
}
function appendNullOmissionMarker(description) {
  if (typeof description === "string" && description.length > 0) {
    return description.includes(NULL_OMISSION_NOTE) ? description : `${description} (${NULL_OMISSION_NOTE})`;
  }
  return NULL_OMISSION_NOTE;
}
function widenTypeWithNull(type) {
  if (typeof type === "string") return [type, "null"];
  if (Array.isArray(type) && !type.includes("null")) return [...type, "null"];
  return type;
}
function shouldInjectNullOmission(key, propSchema, required) {
  return isPlainObject(propSchema) && Array.isArray(propSchema.enum) && !required.has(key) && !hasOwn(propSchema, "default");
}
function widenPropertyForNullOmission(propSchema) {
  const widened = { ...propSchema };
  const enumValues = propSchema.enum;
  widened.enum = enumValues.includes(null) ? enumValues : [...enumValues, null];
  widened.type = widenTypeWithNull(propSchema.type);
  widened.description = appendNullOmissionMarker(propSchema.description);
  return widened;
}
function shouldInjectStringNullOmission(key, propSchema, required) {
  return isPlainObject(propSchema) && !Array.isArray(propSchema.enum) && isPlainStringType(propSchema.type) && !schemaTypeIncludes(propSchema.type, "null") && !required.has(key) && !hasOwn(propSchema, "default");
}
function widenStringPropertyForNullOmission(propSchema) {
  return {
    ...propSchema,
    type: widenTypeWithNull(propSchema.type),
    description: appendNullOmissionMarker(propSchema.description)
  };
}
function injectOptionalEnumOmissionSentinel(schema) {
  if (!isPlainObject(schema) || !isPlainObject(schema.properties)) return schema;
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  let changed = false;
  const nextProperties = { ...schema.properties };
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (!shouldInjectNullOmission(key, propSchema, required)) continue;
    nextProperties[key] = widenPropertyForNullOmission(propSchema);
    changed = true;
  }
  if (!changed) return schema;
  return { ...schema, properties: nextProperties };
}
function injectOptionalEnumOmissionForTools(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!isPlainObject(tool)) return tool;
    const result = { ...tool };
    if ("parameters" in result && !isPlainObject(result.function)) {
      result.parameters = injectOptionalEnumOmissionSentinel(result.parameters);
    }
    return result;
  });
}
function injectOptionalStringOmissionSentinel(schema) {
  if (!isPlainObject(schema) || !isPlainObject(schema.properties)) return schema;
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  let changed = false;
  const nextProperties = { ...schema.properties };
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (!shouldInjectStringNullOmission(key, propSchema, required)) continue;
    nextProperties[key] = widenStringPropertyForNullOmission(propSchema);
    changed = true;
  }
  if (!changed) return schema;
  return { ...schema, properties: nextProperties };
}
function injectOptionalStringOmissionForTools(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!isPlainObject(tool)) return tool;
    const result = { ...tool };
    if (isPlainObject(result.function) && "parameters" in result.function) {
      result.function = {
        ...result.function,
        parameters: injectOptionalStringOmissionSentinel(result.function.parameters)
      };
    }
    if ("parameters" in result && !isPlainObject(result.function)) {
      result.parameters = injectOptionalStringOmissionSentinel(result.parameters);
    }
    return result;
  });
}
function sanitizeToolDescriptions(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => sanitizeToolDescription(tool));
}
function sanitizeToolId(id) {
  if (!id) return `tool_${crypto.randomUUID().replace(/-/g, "_")}`;
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized || `tool_${crypto.randomUUID().replace(/-/g, "_")}`;
}
function injectEmptyReasoningContentForToolCalls(messages, provider, model) {
  const normalizedProvider = String(provider ?? "");
  const normalizedModel = String(model ?? "");
  const needsReasoning = requiresReasoningReplay({
    provider: normalizedProvider,
    model: normalizedModel,
    thinkingEnabled: true
  });
  if (!Array.isArray(messages) || !needsReasoning) {
    return messages;
  }
  return messages.map((message) => {
    if (!isPlainObject(message)) return message;
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0 || message.reasoning_content !== void 0) {
      return message;
    }
    return { ...message, reasoning_content: "" };
  });
}
const SCHEMA_PLACEHOLDER_PATTERN = /^\[(?:MaxDepth|Truncated|Circular|Object|Array)\]$/;
const ARRAY_SCHEMA_KEYS = ["enum", "required", "anyOf", "oneOf", "allOf", "prefixItems"];
const SCHEMA_ARRAY_OF_SCHEMAS = /* @__PURE__ */ new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);
const SCHEMA_SLOT_KEYS = [
  "items",
  "additionalProperties",
  "propertyNames",
  "contains",
  "not",
  "if",
  "then",
  "else",
  "unevaluatedProperties",
  "additionalItems"
];
function coerceIndexedObjectToArray(value) {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((key, index) => String(index) === key)) {
      return keys.map((key) => value[key]);
    }
  }
  return null;
}
function isSchemaPlaceholder(value) {
  return typeof value === "string" && SCHEMA_PLACEHOLDER_PATTERN.test(value.trim());
}
function stripInvalidSchemaConstructs(schema) {
  if (Array.isArray(schema)) {
    return schema.map((entry) => stripInvalidSchemaConstructs(entry));
  }
  if (!isPlainObject(schema)) {
    return isSchemaPlaceholder(schema) ? {} : schema;
  }
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (NUMERIC_SCHEMA_FIELDS.includes(key)) {
      result[key] = coerceNumericString(value);
      continue;
    }
    if (ARRAY_SCHEMA_KEYS.includes(key)) {
      const array = coerceIndexedObjectToArray(value);
      if (array === null) continue;
      result[key] = SCHEMA_ARRAY_OF_SCHEMAS.has(key) ? array.map((entry) => stripInvalidSchemaConstructs(entry)) : array;
      continue;
    }
    if (SCHEMA_SLOT_KEYS.includes(key)) {
      if (isPlainObject(value) || Array.isArray(value)) {
        result[key] = stripInvalidSchemaConstructs(value);
      } else if (typeof value === "boolean") {
        result[key] = value;
      } else if (isSchemaPlaceholder(value)) {
        result[key] = {};
      } else {
        result[key] = value;
      }
      continue;
    }
    if (key === "const") {
      if (isSchemaPlaceholder(value)) continue;
      result[key] = value;
      continue;
    }
    if (key === "properties" && isPlainObject(value)) {
      const properties = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        if (isPlainObject(propSchema) || Array.isArray(propSchema)) {
          properties[propName] = stripInvalidSchemaConstructs(propSchema);
        } else if (typeof propSchema === "boolean") {
          properties[propName] = propSchema;
        } else if (isSchemaPlaceholder(propSchema)) {
          properties[propName] = {};
        } else {
          properties[propName] = propSchema;
        }
      }
      result[key] = properties;
      continue;
    }
    if ((key === "$defs" || key === "definitions" || key === "patternProperties" || key === "dependentSchemas") && isPlainObject(value)) {
      const defs = {};
      for (const [defName, defSchema] of Object.entries(value)) {
        defs[defName] = stripInvalidSchemaConstructs(defSchema);
      }
      result[key] = defs;
      continue;
    }
    result[key] = isPlainObject(value) || Array.isArray(value) ? stripInvalidSchemaConstructs(value) : value;
  }
  return result;
}
function sanitizeClaudeToolSchema(schema) {
  return stripInvalidSchemaConstructs(schema);
}
function sanitizeClaudeToolSchemas(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!isPlainObject(tool) || tool.input_schema === void 0) return tool;
    return { ...tool, input_schema: sanitizeClaudeToolSchema(tool.input_schema) };
  });
}
export {
  coerceSchemaNumericFields,
  coerceToolSchemas,
  injectEmptyReasoningContentForToolCalls,
  injectOptionalEnumOmissionForTools,
  injectOptionalEnumOmissionSentinel,
  injectOptionalStringOmissionForTools,
  injectOptionalStringOmissionSentinel,
  sanitizeClaudeToolSchema,
  sanitizeClaudeToolSchemas,
  sanitizeToolDescription,
  sanitizeToolDescriptions,
  sanitizeToolId,
  stripInvalidSchemaConstructs,
  stripUnsupportedRegexPatterns
};
