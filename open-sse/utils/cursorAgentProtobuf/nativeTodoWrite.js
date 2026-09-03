import { WT_LEN, WT_VARINT, decodeFields } from "./wire.js";
const TCCU_TOOL_CALL_ID = 1;
const TCCU_TOOL_CALL = 2;
const TOOL_CALL_TODO_WRITE = 9;
const TODO_WRITE_ARGS = 1;
const TODO_ARGS_TODOS = 1;
const TODO_ARGS_MERGE = 2;
const TODO_ITEM_CONTENT = 2;
const TODO_ITEM_STATUS = 3;
function decodeNativeTodoStatus(value) {
  switch (value) {
    case 1n:
      return "pending";
    case 2n:
      return "in_progress";
    case 3n:
      return "completed";
    case 4n:
      return "cancelled";
    default:
      return null;
  }
}
function uniqueLenField(fields, fieldNumber) {
  const matches = fields.filter((field2) => field2.fieldNumber === fieldNumber);
  if (matches.length !== 1) return null;
  const field = matches[0];
  return field.wireType === WT_LEN ? field : null;
}
function uniqueVarintField(fields, fieldNumber) {
  const matches = fields.filter((field2) => field2.fieldNumber === fieldNumber);
  if (matches.length !== 1) return null;
  const field = matches[0];
  return field.wireType === WT_VARINT ? field : null;
}
function decodeNonEmptyUtf8(bytes) {
  const value = bytes.toString("utf8");
  if (!value || !Buffer.from(value, "utf8").equals(bytes)) return null;
  return value;
}
function decodeNativeTodoWriteCompletion(payload) {
  const completedFields = decodeFields(payload);
  const toolCallIdField = uniqueLenField(completedFields, TCCU_TOOL_CALL_ID);
  const toolCallField = uniqueLenField(completedFields, TCCU_TOOL_CALL);
  if (!toolCallIdField || !toolCallField) return null;
  const toolCallId = decodeNonEmptyUtf8(toolCallIdField.bytes);
  if (!toolCallId) return null;
  const todoWriteField = uniqueLenField(decodeFields(toolCallField.bytes), TOOL_CALL_TODO_WRITE);
  if (!todoWriteField) return null;
  const argsField = uniqueLenField(decodeFields(todoWriteField.bytes), TODO_WRITE_ARGS);
  if (!argsField) return null;
  const argsFields = decodeFields(argsField.bytes);
  const todos = [];
  const mergeFields = argsFields.filter((field) => field.fieldNumber === TODO_ARGS_MERGE);
  if (mergeFields.length > 1) return null;
  const mergeField = mergeFields.length === 1 ? uniqueVarintField(argsFields, TODO_ARGS_MERGE) : null;
  if (mergeFields.length === 1 && !mergeField) return null;
  const merge = mergeField ? mergeField.varint !== 0n : false;
  for (const field of argsFields) {
    if (field.fieldNumber === TODO_ARGS_MERGE) continue;
    if (field.fieldNumber !== TODO_ARGS_TODOS) continue;
    if (field.wireType !== WT_LEN) return null;
    const itemFields = decodeFields(field.bytes);
    const contentField = uniqueLenField(itemFields, TODO_ITEM_CONTENT);
    const statusField = uniqueVarintField(itemFields, TODO_ITEM_STATUS);
    if (!contentField || !statusField) return null;
    const content = decodeNonEmptyUtf8(contentField.bytes);
    const status = decodeNativeTodoStatus(statusField.varint);
    if (!content || !status) return null;
    todos.push({ content, status });
  }
  return { kind: "native_todo_write", toolCallId, merge, todos };
}
export {
  decodeNativeTodoWriteCompletion
};
