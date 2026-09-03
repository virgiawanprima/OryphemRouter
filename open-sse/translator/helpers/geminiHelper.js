import { safeParseJSON } from "./jsonUtil.js";
const GEMINI_UNSUPPORTED_SCHEMA_KEYS = /* @__PURE__ */ new Set([
  // Basic constraints (not supported by Gemini API)
  "minLength",
  "maxLength",
  "exclusiveMinimum",
  "exclusiveMaximum",
  // `multipleOf` is not part of the Gemini/antigravity OpenAPI 3.0 schema subset;
  // leaving it in function_declarations triggers a hard upstream 400
  // ("Unknown name \"multipleOf\""). `minimum`/`maximum` ARE accepted and kept.
  "multipleOf",
  // OpenAI "strict" tool-calling mode embeds `strict: true/false` directly inside
  // a function's `parameters` schema (RubyLLM and other OpenAI-convention clients
  // do this by default). Gemini's function_declarations schema doesn't recognize
  // it and 400s the same way ("Unknown name \"strict\" ... Cannot find field").
  "strict",
  // Codex's multi-agent collaboration tools (spawn_agent / send_message /
  // followup_task) mark their `message` parameter schema with a non-standard
  // `encrypted: true` annotation (JsonSchema::with_encrypted). Gemini's
  // function_declarations schema doesn't recognize it and 400s the same way
  // ("Unknown name \"encrypted\" ... Cannot find field").
  "encrypted",
  // NOTE: `pattern` is intentionally NOT in this set. Antigravity (Gemini-derived
  // surface) accepts `pattern` on string constraints, and glob/grep/file-search
  // tools depend on it to express their argument regex. Removing it produced
  // upstream 400s and wrong-tool semantics (decolua/9router#1368).
  "minItems",
  "maxItems",
  "format",
  // Claude rejects these in VALIDATED mode
  "default",
  "examples",
  // JSON Schema meta keywords
  "$schema",
  "$id",
  "$anchor",
  "$dynamicRef",
  "$dynamicAnchor",
  "$vocabulary",
  "$comment",
  "$defs",
  "definitions",
  "const",
  "$ref",
  "ref",
  // Object validation keywords (not supported)
  "propertyNames",
  "patternProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "contains",
  "minContains",
  "maxContains",
  // #9617: array uniqueness keyword — agentic-CLI tool schemas (JSON-Schema
  // generators) set this routinely and Gemini's schema parser has no field for
  // it, rejecting the whole request with "Unknown name \"uniqueItems\"".
  // Upstream 9router already strips it alongside `contains` for the same error.
  "uniqueItems",
  // Complex schema keywords (handled by flattenAnyOfOneOf/mergeAllOf)
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  // Dependency keywords (not supported)
  "dependencies",
  "dependentSchemas",
  "dependentRequired",
  // Other unsupported keywords
  "title",
  "if",
  "then",
  "else",
  "contentMediaType",
  "contentEncoding",
  "contentSchema",
  "readOnly",
  "writeOnly",
  // Non-standard schema fields (not recognized by Gemini API)
  "deprecated",
  "optional",
  // VS Code / JSON Language Service extensions injected by GitHub Copilot tools (#1175)
  "enumDescriptions",
  "markdownDescription",
  "markdownEnumDescriptions",
  "enumItemLabels",
  "tags",
  // UI/Styling properties (from Cursor tools - NOT JSON Schema standard)
  "cornerRadius",
  "fillColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "gap",
  "padding",
  "strokeColor",
  "strokeThickness",
  "textColor"
]);
const UNSUPPORTED_SCHEMA_CONSTRAINTS = [...GEMINI_UNSUPPORTED_SCHEMA_KEYS];
const DEFAULT_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" }
];
function normalizeAudioMimeType(format) {
  const normalized = typeof format === "string" && format.trim() ? format.trim().toLowerCase() : "wav";
  if (normalized === "mp3") {
    return "audio/mpeg";
  }
  return `audio/${normalized}`;
}
function convertOpenAIContentToParts(content) {
  const parts = [];
  if (typeof content === "string") {
    parts.push({ text: content });
  } else if (Array.isArray(content)) {
    for (const item of content) {
      const rec = toRecord(item);
      if (rec.type === "text") {
        parts.push({ text: rec.text });
      } else if (rec.type === "input_audio" || rec.type === "audio") {
        const audio = toRecord(rec.input_audio || rec.audio);
        if (typeof audio.data === "string" && audio.data) {
          parts.push({
            inlineData: {
              mimeType: normalizeAudioMimeType(audio.format),
              data: audio.data.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, "")
            }
          });
        }
      } else if (rec.type === "audio_url") {
        const audioUrl = toRecord(rec.audio_url);
        const url = typeof audioUrl.url === "string" ? audioUrl.url : "";
        if (url.startsWith("data:")) {
          const commaIndex = url.indexOf(",");
          if (commaIndex !== -1) {
            const mimePart = url.substring(5, commaIndex);
            const data = url.substring(commaIndex + 1);
            const mimeType = mimePart.split(";")[0] || "audio/wav";
            parts.push({ inlineData: { mimeType, data } });
          }
        }
      } else {
        const geminiInline = toRecord(rec.inline_data || rec.inlineData);
        if (geminiInline?.data) {
          parts.push({
            inlineData: {
              mimeType: String(
                geminiInline.mime_type || geminiInline.mimeType || "application/pdf"
              ),
              data: String(geminiInline.data).replace(/^data:[a-zA-Z0-9/+-]+;base64,/, "")
            }
          });
          continue;
        }
        const source = toRecord(rec.source);
        if (source?.type === "base64" && source?.data) {
          parts.push({
            inlineData: {
              mimeType: String(source.media_type || "application/pdf"),
              data: String(source.data).replace(/^data:[a-zA-Z0-9/+-]+;base64,/, "")
            }
          });
          continue;
        }
        const file = toRecord(rec.file);
        const doc = toRecord(rec.document);
        const rawDataStr = rec.data || rec.file_data || file?.data || file?.file_data || doc?.data || doc?.file_data;
        if (typeof rawDataStr === "string" && !rawDataStr.startsWith("http")) {
          let mimeType = rec.mime_type || rec.media_type || file?.mime_type || doc?.mime_type || "application/pdf";
          if (rawDataStr.startsWith("data:")) {
            const commaIndex = rawDataStr.indexOf(",");
            if (commaIndex !== -1) {
              const parsedMime = rawDataStr.substring(5, commaIndex).split(";")[0];
              if (parsedMime) mimeType = parsedMime;
            }
          }
          const rawData = rawDataStr.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, "");
          parts.push({
            inlineData: {
              mimeType: String(mimeType),
              data: rawData
            }
          });
          continue;
        }
        const imageUrl = toRecord(rec.image_url);
        const imageObj = toRecord(rec.image);
        const fileUrl = toRecord(rec.file_url);
        const fileObj = toRecord(rec.file);
        const docObj = toRecord(rec.document);
        const fileData = (typeof rec.file_url === "string" ? rec.file_url : void 0) || // AI SDK-style image part: { type: "image", image: "data:...;base64,..." } (#1330)
        (typeof rec.image === "string" ? rec.image : void 0) || imageUrl?.url || imageObj?.url || fileUrl?.url || fileObj?.url || docObj?.url;
        if (typeof fileData === "string" && fileData.startsWith("data:")) {
          const commaIndex = fileData.indexOf(",");
          if (commaIndex !== -1) {
            const mimePart = fileData.substring(5, commaIndex);
            const data = fileData.substring(commaIndex + 1);
            const mimeType = mimePart.split(";")[0];
            parts.push({
              inlineData: { mimeType, data }
            });
          }
        } else if (typeof fileData === "string" && /^https?:\/\//i.test(fileData)) {
          parts.push({
            fileData: { fileUri: fileData, mimeType: "image/*" }
          });
        }
      }
    }
  }
  return parts;
}
function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => toRecord(item)).filter((c) => c.type === "text").map((c) => typeof c.text === "string" ? c.text : "").join("");
  }
  return "";
}
function tryParseJSON(str) {
  return safeParseJSON(str, null);
}
function generateRequestId() {
  return `agent-${crypto.randomUUID()}`;
}
function generateSessionId() {
  const arr = new BigUint64Array(1);
  globalThis.crypto.getRandomValues(arr);
  const num = arr[0] % 9000000000000000000n;
  return `-${num.toString()}`;
}
function cloneSchemaValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneSchemaValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneSchemaValue(nestedValue)])
    );
  }
  return value;
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function decodeJsonPointerSegment(segment) {
  return String(segment).replace(/~1/g, "/").replace(/~0/g, "~");
}
function resolveLocalReference(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  let current = root;
  const segments = ref.slice(2).split("/").filter(Boolean).map((segment) => decodeJsonPointerSegment(segment));
  for (const segment of segments) {
    const currentRecord = toRecord(current);
    if (!(segment in currentRecord)) {
      return null;
    }
    current = currentRecord[segment];
  }
  return current;
}
function inlineLocalSchemaRefs(node, root, activeRefs = /* @__PURE__ */ new Set()) {
  if (Array.isArray(node)) {
    return node.map((item) => inlineLocalSchemaRefs(item, root, activeRefs));
  }
  if (!node || typeof node !== "object") {
    return node;
  }
  const record = { ...toRecord(node) };
  const ref = typeof record.$ref === "string" ? record.$ref : "";
  if (ref.startsWith("#/$defs/") || ref.startsWith("#/definitions/")) {
    const rest = { ...record };
    delete rest.$ref;
    if (activeRefs.has(ref)) {
      return inlineLocalSchemaRefs(rest, root, activeRefs);
    }
    const resolved = resolveLocalReference(root, ref);
    if (!resolved || typeof resolved !== "object") {
      return inlineLocalSchemaRefs(rest, root, activeRefs);
    }
    activeRefs.add(ref);
    const merged = {
      ...toRecord(inlineLocalSchemaRefs(cloneSchemaValue(resolved), root, activeRefs)),
      ...rest
    };
    activeRefs.delete(ref);
    return inlineLocalSchemaRefs(merged, root, activeRefs);
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      inlineLocalSchemaRefs(value, root, activeRefs)
    ])
  );
}
function removeUnsupportedKeywords(obj, keywords) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      removeUnsupportedKeywords(item, keywords);
    }
    return;
  }
  const record = obj;
  for (const key of Object.keys(record)) {
    if (keywords.has(key) || key.startsWith("x-")) {
      delete record[key];
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== "object") continue;
    if (key === "properties" && !Array.isArray(value)) {
      for (const subSchema of Object.values(value)) {
        removeUnsupportedKeywords(subSchema, keywords);
      }
    } else {
      removeUnsupportedKeywords(value, keywords);
    }
  }
}
function normalizeAdditionalProperties(obj) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      normalizeAdditionalProperties(item);
    }
    return;
  }
  const record = obj;
  if ("additionalProperties" in record) {
    delete record.additionalProperties;
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      normalizeAdditionalProperties(value);
    }
  }
}
function convertConstToEnum(obj) {
  if (!obj || typeof obj !== "object") return;
  const record = obj;
  if (record.const !== void 0 && !record.enum) {
    record.enum = [record.const];
    delete record.const;
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      convertConstToEnum(value);
    }
  }
}
function convertEnumValuesToStrings(obj) {
  if (!obj || typeof obj !== "object") return;
  const record = obj;
  if (record.enum && Array.isArray(record.enum)) {
    if (record.type === "integer" || record.type === "number") {
      delete record.enum;
    } else {
      record.enum = record.enum.map((v) => String(v));
      if (!record.type) {
        record.type = "string";
      }
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      convertEnumValuesToStrings(value);
    }
  }
}
function mergeAllOf(obj) {
  if (!obj || typeof obj !== "object") return;
  const record = obj;
  if (record.allOf && Array.isArray(record.allOf)) {
    const merged = {};
    for (const item of record.allOf) {
      const itemRecord = toRecord(item);
      const itemProperties = toRecord(itemRecord.properties);
      if (Object.keys(itemProperties).length > 0) {
        if (!merged.properties) merged.properties = {};
        Object.assign(merged.properties, itemProperties);
      }
      if (itemRecord.required && Array.isArray(itemRecord.required)) {
        if (!merged.required) merged.required = [];
        for (const req of itemRecord.required) {
          if (typeof req === "string" && !merged.required.includes(req)) {
            merged.required.push(req);
          }
        }
      }
    }
    delete record.allOf;
    if (merged.properties)
      record.properties = { ...toRecord(record.properties), ...merged.properties };
    if (merged.required) {
      const required = Array.isArray(record.required) ? record.required.filter((item) => typeof item === "string") : [];
      record.required = [...required, ...merged.required];
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      mergeAllOf(value);
    }
  }
}
function selectBest(items) {
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < items.length; i++) {
    const item = toRecord(items[i]);
    let score = 0;
    const type = item.type;
    if (type === "object" || item.properties) {
      score = 3;
    } else if (type === "array" || item.items) {
      score = 2;
    } else if (type && type !== "null") {
      score = 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}
function flattenAnyOfOneOf(obj) {
  if (!obj || typeof obj !== "object") return;
  const record = obj;
  if (record.anyOf && Array.isArray(record.anyOf) && record.anyOf.length > 0) {
    const nonNullSchemas = record.anyOf.filter((s) => s && toRecord(s).type !== "null");
    if (nonNullSchemas.length > 0) {
      const bestIdx = selectBest(nonNullSchemas);
      const selected = nonNullSchemas[bestIdx];
      delete record.anyOf;
      Object.assign(record, toRecord(selected));
    }
  }
  if (record.oneOf && Array.isArray(record.oneOf) && record.oneOf.length > 0) {
    const nonNullSchemas = record.oneOf.filter((s) => s && toRecord(s).type !== "null");
    if (nonNullSchemas.length > 0) {
      const bestIdx = selectBest(nonNullSchemas);
      const selected = nonNullSchemas[bestIdx];
      delete record.oneOf;
      Object.assign(record, toRecord(selected));
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      flattenAnyOfOneOf(value);
    }
  }
}
function flattenTypeArrays(obj) {
  if (!obj || typeof obj !== "object") return;
  const record = obj;
  if (record.type && Array.isArray(record.type)) {
    const nonNullTypes = record.type.filter((t) => t !== "null");
    record.type = nonNullTypes.length > 0 ? nonNullTypes[0] : "string";
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      flattenTypeArrays(value);
    }
  }
}
function cleanJSONSchemaForAntigravity(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const root = cloneSchemaValue(schema);
  let cleaned = inlineLocalSchemaRefs(root, root);
  convertConstToEnum(cleaned);
  convertEnumValuesToStrings(cleaned);
  mergeAllOf(cleaned);
  flattenAnyOfOneOf(cleaned);
  flattenTypeArrays(cleaned);
  normalizeAdditionalProperties(cleaned);
  removeUnsupportedKeywords(cleaned, GEMINI_UNSUPPORTED_SCHEMA_KEYS);
  function cleanupRequired(obj) {
    if (!obj || typeof obj !== "object") return;
    const record = obj;
    if (record.required && Array.isArray(record.required) && record.properties) {
      const properties = toRecord(record.properties);
      const validRequired = record.required.filter(
        (field) => typeof field === "string" && Object.prototype.hasOwnProperty.call(properties, field)
      );
      if (validRequired.length === 0) {
        delete record.required;
      } else {
        record.required = validRequired;
      }
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        cleanupRequired(value);
      }
    }
  }
  cleanupRequired(cleaned);
  function addPlaceholders(obj) {
    if (!obj || typeof obj !== "object") return;
    const record = obj;
    if (record.type === "object") {
      if (!record.properties || Object.keys(toRecord(record.properties)).length === 0) {
        record.properties = {
          reason: {
            type: "string",
            description: "Brief explanation of why you are calling this tool"
          }
        };
        record.required = ["reason"];
      }
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        addPlaceholders(value);
      }
    }
  }
  addPlaceholders(cleaned);
  function injectObjectType(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        injectObjectType(item);
      }
      return;
    }
    const record = obj;
    if (!record.type && (record.properties !== void 0 || record.required !== void 0)) {
      record.type = "object";
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        injectObjectType(value);
      }
    }
  }
  injectObjectType(cleaned);
  function ensureArrayItems(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        ensureArrayItems(item);
      }
      return;
    }
    const record = obj;
    if (record.type === "array" && !record.items) {
      record.items = { type: "string" };
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        ensureArrayItems(value);
      }
    }
  }
  ensureArrayItems(cleaned);
  return cleaned;
}
export {
  DEFAULT_SAFETY_SETTINGS,
  GEMINI_UNSUPPORTED_SCHEMA_KEYS,
  UNSUPPORTED_SCHEMA_CONSTRAINTS,
  cleanJSONSchemaForAntigravity,
  convertOpenAIContentToParts,
  extractTextContent,
  generateRequestId,
  generateSessionId,
  tryParseJSON
};
