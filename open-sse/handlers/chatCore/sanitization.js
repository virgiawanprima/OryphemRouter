import { FORMATS } from "../../translator/formats.js";
import { sanitizeOpenAITool } from "../../utils/omni/toolSchemaSanitizer.js";
function sanitizeChatRequestBody(body, sourceFormat, targetFormat) {
  void sourceFormat;
  const prefersResponsesTokenField = targetFormat === FORMATS.OPENAI_RESPONSES;
  if (prefersResponsesTokenField) {
    if (body.max_output_tokens === void 0) {
      if (body.max_completion_tokens !== void 0) {
        body.max_output_tokens = body.max_completion_tokens;
        delete body.max_completion_tokens;
      } else if (body.max_tokens !== void 0) {
        body.max_output_tokens = body.max_tokens;
        delete body.max_tokens;
      }
    }
  } else if (body.max_output_tokens !== void 0) {
    if (body.max_tokens === void 0) {
      body.max_tokens = body.max_output_tokens;
    }
    delete body.max_output_tokens;
  }
  if (Array.isArray(body.messages)) {
    body.messages = body.messages.map((msg) => {
      if (msg.name === "") {
        const { name: _n, ...rest } = msg;
        return rest;
      }
      return msg;
    });
  }
  if (Array.isArray(body.input)) {
    body.input = body.input.map((item) => {
      if (item.name === "") {
        const { name: _n, ...rest } = item;
        return rest;
      }
      return item;
    });
  }
  if (Array.isArray(body.tools)) {
    const tools = body.tools.filter((tool) => {
      const toolType = typeof tool.type === "string" ? tool.type : "";
      if (toolType && toolType !== "function" && !tool.function && tool.name === void 0) {
        return true;
      }
      const fn = tool.function;
      const name = fn?.name ?? tool.name;
      return name && String(name).trim().length > 0;
    });
    body.tools = tools.map((tool) => sanitizeOpenAITool(tool));
  }
  return body;
}
export {
  sanitizeChatRequestBody
};
