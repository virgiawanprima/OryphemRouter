import { FORMATS } from "../../translator/formats.js";
function normalizeOpenAICompatibleTools(tools, sourceFormat) {
  if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
    return { tools, dropped: 0 };
  }
  const before = tools.length;
  const normalized = tools.filter(
    (tool) => !tool.type || tool.type === "function" || !!tool.function || !!tool.name
  ).map((tool) => {
    if (!tool.type || tool.type === "function" || tool.function) {
      return tool;
    }
    return {
      type: "function",
      function: {
        name: tool.name,
        ...tool.description === void 0 ? {} : { description: tool.description },
        ...tool.parameters !== void 0 || tool.input_schema !== void 0 ? { parameters: tool.parameters ?? tool.input_schema ?? {} } : {},
        ...tool.strict === void 0 ? {} : { strict: tool.strict }
      }
    };
  });
  return { tools: normalized, dropped: before - normalized.length };
}
export {
  normalizeOpenAICompatibleTools
};
