import { TEXT_ENCODER } from "../utils/omni/kiroEventstream.js";
const KIRO_TOOL_CALL_WRAPPER = "tool_call";
function parseKiroToolInput(toolInput) {
  if (typeof toolInput !== "string") return toolInput;
  try {
    return JSON.parse(toolInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Kiro tool_call payload: input must be valid JSON (${message})`);
  }
}
function validateKiroToolName(toolUse) {
  const toolName = typeof toolUse.name === "string" ? toolUse.name.trim() : "";
  if (!toolName) throw new Error("Invalid Kiro toolUseEvent: missing tool name");
  return toolName;
}
function validateKiroToolCallWrapperInput(toolInput) {
  if (toolInput === void 0) {
    throw new Error("Invalid Kiro tool_call payload: missing input");
  }
  const input = parseKiroToolInput(toolInput);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(
      "Invalid Kiro tool_call payload: input must be an object with name and arguments"
    );
  }
  const record = input;
  if (typeof record.name !== "string" || !record.name.trim()) {
    throw new Error("Invalid Kiro tool_call payload: missing nested MCP tool name at input.name");
  }
  if (!Object.prototype.hasOwnProperty.call(record, "arguments")) {
    throw new Error(
      "Invalid Kiro tool_call payload: missing nested MCP tool arguments at input.arguments"
    );
  }
}
function validateKiroToolUse(toolUse) {
  const toolName = validateKiroToolName(toolUse);
  if (toolName === KIRO_TOOL_CALL_WRAPPER) {
    validateKiroToolCallWrapperInput(toolUse.input);
  }
}
function appendBufferedKiroToolInput(toolCall, toolInput) {
  if (toolInput === void 0) return;
  if (typeof toolInput === "string") {
    if (toolCall.inputKind && toolCall.inputKind !== "string") {
      throw new Error("Invalid Kiro tool_call payload: mixed input fragment types");
    }
    toolCall.inputKind = "string";
    toolCall.inputText = `${toolCall.inputText || ""}${toolInput}`;
    return;
  }
  if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
    if (toolCall.inputKind && toolCall.inputKind !== "object") {
      throw new Error("Invalid Kiro tool_call payload: mixed input fragment types");
    }
    toolCall.inputKind = "object";
    toolCall.inputObject = toolInput;
  }
}
function getBufferedKiroToolInput(toolCall) {
  return toolCall.inputKind === "string" ? toolCall.inputText || "" : toolCall.inputObject;
}
function encodeSse(value) {
  return TEXT_ENCODER.encode(value);
}
export {
  KIRO_TOOL_CALL_WRAPPER,
  appendBufferedKiroToolInput,
  encodeSse,
  getBufferedKiroToolInput,
  parseKiroToolInput,
  validateKiroToolCallWrapperInput,
  validateKiroToolName,
  validateKiroToolUse
};
