import zlib from "node:zlib";
import crypto from "node:crypto";
import { decodeNativeTodoWriteCompletion } from "./cursorAgentProtobuf/nativeTodoWrite.js";
import {
  cursorImageAttachmentPath,
  encodeSelectedImageBody
} from "./cursorAgentProtobuf/imageEncoding.js";
import {
  WT_VARINT,
  WT_LEN,
  encodeVarint,
  encodeTag,
  encodeBytes,
  encodeString,
  encodeMessage,
  encodeUInt32Field,
  encodeBoolField,
  encodeDoubleField,
  decodeVarint,
  checkedLen,
  decodeFields,
  decodeStringField,
  decodeVarintField
} from "./cursorAgentProtobuf/wire.js";
const ACM_RUN_REQUEST = 1;
const ARR_CONVERSATION_STATE = 1;
const ARR_ACTION = 2;
const ARR_MODEL_DETAILS = 3;
const ARR_CONVERSATION_ID = 5;
const ARR_MCP_TOOLS = 4;
const ARR_REQUESTED_MODEL = 9;
const ARR_UNKNOWN_12 = 12;
const ARR_REQUEST_ID = 16;
const CSS_ROOT_PROMPT = 1;
const CSS_TURNS = 8;
const CA_USER_MESSAGE_ACTION = 1;
const UMA_USER_MESSAGE = 1;
const UM_TEXT = 1;
const UM_MESSAGE_ID = 2;
const UM_SELECTED_CONTEXT = 3;
const UM_MODE = 4;
const SC_SELECTED_IMAGES = 1;
const RM_MODEL_ID = 1;
const RM_PARAMETERS = 3;
const MD_MODEL_ID = 1;
const MD_DISPLAY_MODEL_ID = 3;
const MD_DISPLAY_NAME = 4;
const RMP_ID = 1;
const RMP_VALUE = 2;
const ACM_EXEC_CLIENT_MESSAGE = 2;
const ECM_ID = 1;
const ECM_EXEC_ID = 15;
const ECM_REQUEST_CONTEXT_RESULT = 10;
const RCR_SUCCESS = 1;
const RCS_REQUEST_CONTEXT = 1;
const ASM_INTERACTION_UPDATE = 1;
const ASM_EXEC_SERVER_MESSAGE = 2;
const ASM_KV_SERVER_MESSAGE = 4;
const ESM_ID = 1;
const ESM_EXEC_ID = 15;
const ESM_REQUEST_CONTEXT_ARGS = 10;
const IU_TEXT_DELTA = 1;
const IU_THINKING_DELTA = 4;
const IU_THINKING_COMPLETED = 5;
const IU_TOOL_CALL_STARTED = 2;
const IU_TOOL_CALL_COMPLETED = 3;
const IU_TOKEN_DELTA = 8;
const IU_HEARTBEAT = 13;
const IU_TURN_ENDED = 14;
const TDU_TEXT = 1;
const ACM_KV_CLIENT_MESSAGE = 3;
const ECM_SHELL_RESULT = 2;
const ECM_WRITE_RESULT = 3;
const ECM_DELETE_RESULT = 4;
const ECM_GREP_RESULT = 5;
const ECM_READ_RESULT = 7;
const ECM_LS_RESULT = 8;
const ECM_DIAGNOSTICS_RESULT = 9;
const ECM_MCP_RESULT = 11;
const ECM_BACKGROUND_SHELL_SPAWN_RES = 16;
const ECM_FETCH_RESULT = 20;
const ECM_WRITE_SHELL_STDIN_RESULT = 23;
const ESM_SHELL_ARGS = 2;
const ESM_WRITE_ARGS = 3;
const ESM_DELETE_ARGS = 4;
const ESM_GREP_ARGS = 5;
const ESM_READ_ARGS = 7;
const ESM_LS_ARGS = 8;
const ESM_DIAGNOSTICS_ARGS = 9;
const ESM_MCP_ARGS = 11;
const ESM_SHELL_STREAM_ARGS = 14;
const ESM_BACKGROUND_SHELL_SPAWN = 16;
const ESM_FETCH_ARGS = 20;
const ESM_WRITE_SHELL_STDIN_ARGS = 23;
const ARG_PATH = 1;
const ARG_SHELL_COMMAND = 1;
const ARG_SHELL_WORKING_DIR = 2;
const ARG_SHELL_TIMEOUT = 3;
const ARG_SHELL_IS_BACKGROUND = 11;
const ARG_SHELL_HARD_TIMEOUT = 14;
const ARG_FETCH_URL = 1;
const KSM_ID = 1;
const KSM_GET_BLOB_ARGS = 2;
const KSM_SET_BLOB_ARGS = 3;
const KSM_REQUEST_METADATA = 4;
const KCM_ID = 1;
const KCM_GET_BLOB_RESULT = 2;
const KCM_SET_BLOB_RESULT = 3;
const KCM_REQUEST_METADATA = 4;
const GBA_BLOB_ID = 1;
const SBA_BLOB_ID = 1;
const SBA_BLOB_DATA = 2;
const GBR_BLOB_DATA = 1;
const REJ_PATH = 1;
const REJ_REASON = 2;
const SREJ_COMMAND = 1;
const SREJ_WORKING_DIR = 2;
const SREJ_REASON = 3;
const ERR_MESSAGE = 1;
const FERR_URL = 1;
const FERR_ERROR = 2;
const RES_REJECTED = 2;
const MTD_NAME = 1;
const MTD_DESCRIPTION = 2;
const MTD_INPUT_SCHEMA = 3;
const MTD_PROVIDER_IDENTIFIER = 4;
const MTD_TOOL_NAME = 5;
const MCA_NAME = 1;
const MCA_ARGS = 2;
const MCA_TOOL_CALL_ID = 3;
const MCA_PROVIDER_IDENTIFIER = 4;
const MCA_TOOL_NAME = 5;
const MCR_SUCCESS = 1;
const MCR_ERROR = 2;
const MCS_CONTENT = 1;
const MCS_IS_ERROR = 2;
const MCC_TEXT = 1;
const MTC_TEXT = 1;
const VAL_NULL = 1;
const VAL_NUMBER = 2;
const VAL_STRING = 3;
const VAL_BOOL = 4;
const VAL_STRUCT = 5;
const VAL_LIST = 6;
const STRUCT_FIELDS = 1;
const LIST_VALUES = 1;
const MAP_KEY = 1;
const MAP_VALUE = 2;
const FLAG_NONE = 0;
const FLAG_GZIP = 1;
function wrapConnectFrame(payload, compressed = false) {
  const data = compressed ? zlib.gzipSync(payload) : payload;
  const header = Buffer.alloc(5);
  header[0] = compressed ? FLAG_GZIP : FLAG_NONE;
  header.writeUInt32BE(data.length, 1);
  return Buffer.concat([header, data]);
}
function* iterateConnectFrames(stream) {
  let pos = 0;
  while (pos + 5 <= stream.length) {
    const flags = stream[pos];
    const length = stream.readUInt32BE(pos + 1);
    if (pos + 5 + length > stream.length) return;
    const raw = stream.subarray(pos + 5, pos + 5 + length);
    const payload = flags & FLAG_GZIP ? zlib.gunzipSync(raw) : raw;
    yield { flags, payload };
    pos += 5 + length;
  }
}
const CURSOR_MODEL_ALIASES = {
  "": "composer-2.5",
  "composer-2-5": "composer-2.5",
  "composer-2.5-sdk": "composer-2.5",
  "composer-latest": "composer-2.5",
  "composer-2-5-fast": "composer-2.5-fast",
  "composer-2.5-sdk-fast": "composer-2.5-fast",
  "composer-latest-fast": "composer-2.5-fast",
  "grok-4.5-medium": "cursor-grok-4.5-medium",
  "grok-4.5-fast-medium": "cursor-grok-4.5-medium-fast",
  "grok-4.5-high": "cursor-grok-4.5-high",
  "grok-4.5-fast-high": "cursor-grok-4.5-high-fast",
  "grok-4.5-xhigh": "cursor-grok-4.5-xhigh",
  "grok-4.5-fast-xhigh": "cursor-grok-4.5-xhigh-fast"
};
function normalizeCursorModelId(modelId) {
  const id = (modelId ?? "").trim();
  const alias = CURSOR_MODEL_ALIASES[id.toLowerCase()];
  return alias ?? id;
}
const CURSOR_EFFORT_SUFFIXES = ["low", "medium", "high", "xhigh", "max"];
function splitCursorEffortSuffix(normalized, prefix, paramId) {
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  for (const suffix of CURSOR_EFFORT_SUFFIXES) {
    const marker = `-${suffix}`;
    if (normalized.endsWith(marker) && normalized.length > prefix.length + marker.length) {
      return {
        modelId: normalized.slice(0, -marker.length),
        parameters: [{ id: paramId, value: suffix }]
      };
    }
  }
  return null;
}
function resolveGrokRequestedModel(normalized) {
  const prefix = normalized.startsWith("cursor-grok-") ? "cursor-grok-" : normalized.startsWith("grok-") ? "grok-" : null;
  if (!prefix) return null;
  let id = normalized;
  const extraParams = [];
  if (id.endsWith("-fast") && id.length > prefix.length + "-fast".length) {
    id = id.slice(0, -"-fast".length);
    extraParams.push({ id: "fast", value: "true" });
  }
  const effortSplit = splitCursorEffortSuffix(id, prefix, "effort");
  if (effortSplit) {
    return {
      modelId: effortSplit.modelId,
      parameters: [...effortSplit.parameters, ...extraParams]
    };
  }
  if (extraParams.length > 0) {
    return { modelId: id, parameters: extraParams };
  }
  return null;
}
const CURSOR_ROUTING_LEVELS = ["cost", "balance", "intelligence"];
const CURSOR_ROUTING_LEVEL_PARAMETER_ID = "optimization";
function resolveRequestedModel(modelId, opts) {
  const normalized = normalizeCursorModelId(modelId);
  if (normalized === "auto") {
    return { modelId: "default", parameters: [] };
  }
  for (const level of CURSOR_ROUTING_LEVELS) {
    if (normalized === `auto-${level}`) {
      return {
        modelId: "default",
        parameters: [{ id: CURSOR_ROUTING_LEVEL_PARAMETER_ID, value: level }]
      };
    }
  }
  if (opts?.liveCatalogIds?.has(normalized)) {
    return { modelId: normalized, parameters: [] };
  }
  if (normalized.startsWith("composer-") && normalized.endsWith("-fast")) {
    return {
      modelId: normalized.slice(0, -"-fast".length),
      parameters: [{ id: "fast", value: "true" }]
    };
  }
  const grokSplit = resolveGrokRequestedModel(normalized);
  if (grokSplit) {
    return grokSplit;
  }
  const claudeSplit = splitCursorEffortSuffix(normalized, "claude-", "effort");
  if (claudeSplit) {
    return claudeSplit;
  }
  const gptSplit = splitCursorEffortSuffix(normalized, "gpt-", "reasoning");
  if (gptSplit) {
    return gptSplit;
  }
  return { modelId: normalized, parameters: [] };
}
function openAIToolsToMcpDefs(tools) {
  return tools.map((t) => {
    const params = t.function?.parameters ?? { type: "object", properties: {} };
    return {
      name: t.function.name,
      description: t.function.description ?? "",
      inputSchemaBytes: jsonSchemaToProtobufValue(params),
      providerIdentifier: "omniroute",
      toolName: t.function.name
    };
  });
}
function encodeAgentRunRequest(input) {
  const conversationId = input.conversationId || crypto.randomUUID();
  const messageId = input.messageId || crypto.randomUUID();
  const { modelId, parameters } = resolveRequestedModel(input.modelId, {
    liveCatalogIds: input.liveCatalogIds
  });
  const selectedContextParts = [];
  if (input.images && input.images.length > 0) {
    for (const img of input.images) {
      selectedContextParts.push(
        encodeMessage(SC_SELECTED_IMAGES, [encodeSelectedImageBody(img, input.blobStore)])
      );
    }
  }
  const userMessage = encodeMessage(UMA_USER_MESSAGE, [
    encodeString(UM_TEXT, input.userText),
    encodeString(UM_MESSAGE_ID, messageId),
    encodeMessage(UM_SELECTED_CONTEXT, selectedContextParts),
    Buffer.concat([encodeTag(UM_MODE, WT_VARINT), encodeVarint(1)])
  ]);
  const userMessageAction = encodeMessage(CA_USER_MESSAGE_ACTION, [userMessage]);
  const action = encodeMessage(ARR_ACTION, [userMessageAction]);
  const cssParts = [];
  if (input.systemPrompt && input.blobStore) {
    const systemJson = JSON.stringify({ role: "system", content: input.systemPrompt });
    const blobBytes = Buffer.from(systemJson, "utf8");
    const blobId = crypto.createHash("sha256").update(blobBytes).digest();
    input.blobStore.set(blobId.toString("hex"), blobBytes);
    cssParts.push(encodeBytes(CSS_ROOT_PROMPT, blobId));
  }
  const conversationState = encodeMessage(ARR_CONVERSATION_STATE, cssParts);
  const rmParts = [encodeString(RM_MODEL_ID, modelId)];
  for (const param of parameters) {
    rmParts.push(
      encodeMessage(RM_PARAMETERS, [
        encodeString(RMP_ID, param.id),
        encodeString(RMP_VALUE, param.value)
      ])
    );
  }
  const requestedModel = encodeMessage(ARR_REQUESTED_MODEL, rmParts);
  const modelDetails = encodeMessage(ARR_MODEL_DETAILS, [
    encodeString(MD_MODEL_ID, modelId),
    encodeString(MD_DISPLAY_MODEL_ID, modelId),
    encodeString(MD_DISPLAY_NAME, modelId)
  ]);
  const mcpToolDefs = input.tools ? openAIToolsToMcpDefs(input.tools) : [];
  const mcpToolsBlock = encodeMessage(
    ARR_MCP_TOOLS,
    mcpToolDefs.map((def) => encodeMessage(ARR_MCP_TOOLS_INNER, [encodeMcpToolDefinitionBody(def)]))
  );
  const agentRunRequest = [
    conversationState,
    action,
    modelDetails,
    mcpToolsBlock,
    encodeString(ARR_CONVERSATION_ID, conversationId),
    requestedModel,
    Buffer.concat([encodeTag(ARR_UNKNOWN_12, WT_VARINT), encodeVarint(0)]),
    encodeString(ARR_REQUEST_ID, conversationId)
  ];
  const acm = encodeMessage(ACM_RUN_REQUEST, agentRunRequest);
  return acm;
}
const ARR_MCP_TOOLS_INNER = 1;
function buildAgentRequestBody(input) {
  return wrapConnectFrame(encodeAgentRunRequest(input));
}
function decodeAgentServerMessage(payload) {
  const out = [];
  for (const top of decodeFields(payload)) {
    if (top.fieldNumber === ASM_KV_SERVER_MESSAGE && top.wireType === 2) {
      out.push({ kind: "kv_server_message" });
      continue;
    }
    if (top.fieldNumber !== ASM_INTERACTION_UPDATE || top.wireType !== 2) continue;
    for (const update of decodeFields(top.bytes)) {
      if (update.wireType !== 2 && update.wireType !== 0) continue;
      switch (update.fieldNumber) {
        case IU_TEXT_DELTA:
          if (update.wireType === 2) {
            out.push({ kind: "text", text: decodeStringField(update.bytes, TDU_TEXT) });
          }
          break;
        case IU_THINKING_DELTA:
          if (update.wireType === 2) {
            out.push({ kind: "thinking", text: decodeStringField(update.bytes, TDU_TEXT) });
          }
          break;
        case IU_THINKING_COMPLETED:
          out.push({ kind: "thinking_complete" });
          break;
        case IU_TOOL_CALL_STARTED:
          out.push({ kind: "tool_call_started" });
          break;
        case IU_TOOL_CALL_COMPLETED:
          if (update.wireType === 2) {
            const todoWrite = decodeNativeTodoWriteCompletion(update.bytes);
            if (todoWrite) out.push(todoWrite);
          }
          out.push({ kind: "tool_call_completed" });
          break;
        case IU_TOKEN_DELTA:
          if (update.wireType === 2) {
            out.push({ kind: "token_delta", tokens: decodeVarintField(update.bytes, 1) });
          }
          break;
        case IU_HEARTBEAT:
          out.push({ kind: "heartbeat" });
          break;
        case IU_TURN_ENDED:
          out.push({ kind: "turn_ended" });
          break;
        default:
          out.push({ kind: "unknown", field: update.fieldNumber });
      }
    }
  }
  return out;
}
function decodeExecRequestContext(payload) {
  const event = decodeExecServerEvent(payload);
  if (event && event.kind === "exec_request_context") {
    return { id: event.execMsgId, execId: event.execId };
  }
  return null;
}
function decodeKvServerEvent(payload) {
  for (const top of decodeFields(payload)) {
    if (top.fieldNumber !== ASM_KV_SERVER_MESSAGE || top.wireType !== 2) continue;
    let kvId = 0;
    let getBlobArgs = null;
    let setBlobArgs = null;
    let requestMetadata = null;
    for (const f of decodeFields(top.bytes)) {
      if (f.fieldNumber === KSM_ID && f.wireType === 0) {
        kvId = Number(f.varint);
      } else if (f.fieldNumber === KSM_GET_BLOB_ARGS && f.wireType === 2) {
        getBlobArgs = f.bytes;
      } else if (f.fieldNumber === KSM_SET_BLOB_ARGS && f.wireType === 2) {
        setBlobArgs = f.bytes;
      } else if (f.fieldNumber === KSM_REQUEST_METADATA && f.wireType === 2) {
        requestMetadata = f.bytes;
      }
    }
    if (getBlobArgs) {
      let blobId = Buffer.alloc(0);
      for (const f of decodeFields(getBlobArgs)) {
        if (f.fieldNumber === GBA_BLOB_ID && f.wireType === 2) {
          blobId = f.bytes;
        }
      }
      return { kind: "kv_get_blob", kvId, blobId, requestMetadata };
    }
    if (setBlobArgs) {
      let blobId = Buffer.alloc(0);
      let blobData = Buffer.alloc(0);
      for (const f of decodeFields(setBlobArgs)) {
        if (f.fieldNumber === SBA_BLOB_ID && f.wireType === 2) {
          blobId = f.bytes;
        } else if (f.fieldNumber === SBA_BLOB_DATA && f.wireType === 2) {
          blobData = f.bytes;
        }
      }
      return { kind: "kv_set_blob", kvId, blobId, blobData, requestMetadata };
    }
  }
  return null;
}
function decodeShellArgs(payload) {
  const decoded = {
    command: decodeStringField(payload, ARG_SHELL_COMMAND),
    workingDir: decodeStringField(payload, ARG_SHELL_WORKING_DIR),
    timeout: 0,
    isBackground: false,
    hardTimeout: 0
  };
  for (const field of decodeFields(payload)) {
    if (field.wireType !== 0) continue;
    if (field.fieldNumber === ARG_SHELL_TIMEOUT) decoded.timeout = Number(field.varint);
    else if (field.fieldNumber === ARG_SHELL_IS_BACKGROUND) {
      decoded.isBackground = field.varint !== 0n;
    } else if (field.fieldNumber === ARG_SHELL_HARD_TIMEOUT) {
      decoded.hardTimeout = Number(field.varint);
    }
  }
  return decoded;
}
function decodeExecServerEvent(payload) {
  for (const top of decodeFields(payload)) {
    if (top.fieldNumber !== ASM_EXEC_SERVER_MESSAGE || top.wireType !== 2) continue;
    let execMsgId = 0;
    let execId = "";
    let variantField = 0;
    let variantBytes = null;
    for (const f of decodeFields(top.bytes)) {
      if (f.fieldNumber === ESM_ID && f.wireType === 0) {
        execMsgId = Number(f.varint);
      } else if (f.fieldNumber === ESM_EXEC_ID && f.wireType === 2) {
        execId = f.bytes.toString("utf8");
      } else if (f.wireType === 2) {
        if (variantField === 0) {
          variantField = f.fieldNumber;
          variantBytes = f.bytes;
        }
      }
    }
    if (variantBytes === null) continue;
    switch (variantField) {
      case ESM_REQUEST_CONTEXT_ARGS:
        return { kind: "exec_request_context", execMsgId, execId };
      case ESM_READ_ARGS:
        return {
          kind: "exec_read",
          execMsgId,
          execId,
          path: decodeStringField(variantBytes, ARG_PATH)
        };
      case ESM_WRITE_ARGS:
        return {
          kind: "exec_write",
          execMsgId,
          execId,
          path: decodeStringField(variantBytes, ARG_PATH)
        };
      case ESM_DELETE_ARGS:
        return {
          kind: "exec_delete",
          execMsgId,
          execId,
          path: decodeStringField(variantBytes, ARG_PATH)
        };
      case ESM_LS_ARGS:
        return {
          kind: "exec_ls",
          execMsgId,
          execId,
          path: decodeStringField(variantBytes, ARG_PATH)
        };
      case ESM_GREP_ARGS:
        return { kind: "exec_grep", execMsgId, execId };
      case ESM_DIAGNOSTICS_ARGS:
        return { kind: "exec_diagnostics", execMsgId, execId };
      case ESM_SHELL_ARGS: {
        const shell = decodeShellArgs(variantBytes);
        return {
          kind: "exec_shell",
          execMsgId,
          execId,
          ...shell
        };
      }
      case ESM_SHELL_STREAM_ARGS: {
        const shell = decodeShellArgs(variantBytes);
        return {
          kind: "exec_shell_stream",
          execMsgId,
          execId,
          ...shell
        };
      }
      case ESM_BACKGROUND_SHELL_SPAWN: {
        const shell = decodeShellArgs(variantBytes);
        return {
          kind: "exec_bg_shell",
          execMsgId,
          execId,
          ...shell
        };
      }
      case ESM_FETCH_ARGS:
        return {
          kind: "exec_fetch",
          execMsgId,
          execId,
          url: decodeStringField(variantBytes, ARG_FETCH_URL)
        };
      case ESM_WRITE_SHELL_STDIN_ARGS:
        return { kind: "exec_write_shell_stdin", execMsgId, execId };
      case ESM_MCP_ARGS: {
        let toolName = "";
        let toolCallId = "";
        const args = {};
        for (const f of decodeFields(variantBytes)) {
          if (f.wireType !== 2) continue;
          if (f.fieldNumber === MCA_TOOL_NAME) {
            toolName = f.bytes.toString("utf8");
          } else if (f.fieldNumber === MCA_NAME && !toolName) {
            toolName = f.bytes.toString("utf8");
          } else if (f.fieldNumber === MCA_TOOL_CALL_ID) {
            toolCallId = f.bytes.toString("utf8");
          } else if (f.fieldNumber === MCA_ARGS) {
            let key = "";
            let valueBytes = null;
            for (const entry of decodeFields(f.bytes)) {
              if (entry.fieldNumber === MAP_KEY && entry.wireType === 2) {
                key = entry.bytes.toString("utf8");
              } else if (entry.fieldNumber === MAP_VALUE && entry.wireType === 2) {
                valueBytes = entry.bytes;
              }
            }
            if (key && valueBytes !== null) {
              args[key] = decodeProtobufValue(valueBytes);
            }
          }
        }
        return { kind: "exec_mcp", execMsgId, execId, toolName, toolCallId, args };
      }
      default:
        return null;
    }
  }
  return null;
}
function encodeRequestContextResponse(id, execId, tools) {
  const rcParts = [];
  if (tools && tools.length > 0) {
    for (const tool of tools) {
      rcParts.push(encodeMessage(RCS_TOOLS, [encodeMcpToolDefinitionBody(tool)]));
    }
  }
  const requestContext = encodeMessage(RCS_REQUEST_CONTEXT, rcParts);
  const success = encodeMessage(RCR_SUCCESS, [requestContext]);
  const ecm = encodeMessage(ACM_EXEC_CLIENT_MESSAGE, [
    encodeUInt32Field(ECM_ID, id),
    encodeString(ECM_EXEC_ID, execId),
    encodeMessage(ECM_REQUEST_CONTEXT_RESULT, [success])
  ]);
  return wrapConnectFrame(ecm);
}
const RCS_TOOLS = 2;
function wrapExecClientMessage(execMsgId, execId, resultFieldNumber, resultPayload) {
  const ecm = encodeMessage(ACM_EXEC_CLIENT_MESSAGE, [
    encodeUInt32Field(ECM_ID, execMsgId),
    encodeString(ECM_EXEC_ID, execId),
    encodeMessage(resultFieldNumber, [resultPayload])
  ]);
  return wrapConnectFrame(ecm);
}
function encodePathRejection(path, reason) {
  return Buffer.concat([encodeString(REJ_PATH, path), encodeString(REJ_REASON, reason)]);
}
function encodeShellRejection(command, workingDir, reason) {
  return Buffer.concat([
    encodeString(SREJ_COMMAND, command),
    encodeString(SREJ_WORKING_DIR, workingDir),
    encodeString(SREJ_REASON, reason)
  ]);
}
function encodeExecReadRejected(execMsgId, execId, path, reason) {
  const rejected = encodeMessage(RES_REJECTED, [encodePathRejection(path, reason)]);
  return wrapExecClientMessage(execMsgId, execId, ECM_READ_RESULT, rejected);
}
function encodeExecWriteRejected(execMsgId, execId, path, reason) {
  const rejected = encodeMessage(RES_REJECTED, [encodePathRejection(path, reason)]);
  return wrapExecClientMessage(execMsgId, execId, ECM_WRITE_RESULT, rejected);
}
function encodeExecDeleteRejected(execMsgId, execId, path, reason) {
  const rejected = encodeMessage(RES_REJECTED, [encodePathRejection(path, reason)]);
  return wrapExecClientMessage(execMsgId, execId, ECM_DELETE_RESULT, rejected);
}
function encodeExecLsRejected(execMsgId, execId, path, reason) {
  const rejected = encodeMessage(RES_REJECTED, [encodePathRejection(path, reason)]);
  return wrapExecClientMessage(execMsgId, execId, ECM_LS_RESULT, rejected);
}
function encodeExecShellRejected(execMsgId, execId, command, workingDir, reason) {
  const rejected = encodeMessage(RES_REJECTED, [encodeShellRejection(command, workingDir, reason)]);
  return wrapExecClientMessage(execMsgId, execId, ECM_SHELL_RESULT, rejected);
}
function encodeExecBackgroundShellSpawnRejected(execMsgId, execId, command, workingDir, reason) {
  const rejected = encodeMessage(RES_REJECTED, [encodeShellRejection(command, workingDir, reason)]);
  return wrapExecClientMessage(execMsgId, execId, ECM_BACKGROUND_SHELL_SPAWN_RES, rejected);
}
function encodeExecGrepError(execMsgId, execId, errMsg) {
  const grepError = encodeString(ERR_MESSAGE, errMsg);
  const errorVariant = encodeMessage(RES_REJECTED, [grepError]);
  return wrapExecClientMessage(execMsgId, execId, ECM_GREP_RESULT, errorVariant);
}
function encodeExecFetchError(execMsgId, execId, url, errMsg) {
  const fetchError = Buffer.concat([encodeString(FERR_URL, url), encodeString(FERR_ERROR, errMsg)]);
  const errorVariant = encodeMessage(RES_REJECTED, [fetchError]);
  return wrapExecClientMessage(execMsgId, execId, ECM_FETCH_RESULT, errorVariant);
}
function encodeExecWriteShellStdinError(execMsgId, execId, errMsg) {
  const stdinError = encodeString(ERR_MESSAGE, errMsg);
  const errorVariant = encodeMessage(RES_REJECTED, [stdinError]);
  return wrapExecClientMessage(execMsgId, execId, ECM_WRITE_SHELL_STDIN_RESULT, errorVariant);
}
function encodeExecDiagnosticsResult(execMsgId, execId) {
  return wrapExecClientMessage(execMsgId, execId, ECM_DIAGNOSTICS_RESULT, Buffer.alloc(0));
}
function encodeExecMcpResult(execMsgId, execId, content, isError) {
  const textContent = encodeMessage(MCC_TEXT, [encodeString(MTC_TEXT, content)]);
  const successFields = [encodeMessage(MCS_CONTENT, [textContent])];
  if (isError) successFields.push(encodeBoolField(MCS_IS_ERROR, true));
  const success = encodeMessage(MCR_SUCCESS, successFields);
  return wrapExecClientMessage(execMsgId, execId, ECM_MCP_RESULT, success);
}
function encodeExecMcpError(execMsgId, execId, errMsg) {
  const mcpError = encodeString(ERR_MESSAGE, errMsg);
  const errorVariant = encodeMessage(MCR_ERROR, [mcpError]);
  return wrapExecClientMessage(execMsgId, execId, ECM_MCP_RESULT, errorVariant);
}
function encodeKvGetBlobResult(kvId, blobData, requestMetadata = null) {
  const getBlobResult = encodeBytes(GBR_BLOB_DATA, blobData);
  const parts = [];
  if (kvId !== 0) parts.push(encodeUInt32Field(KCM_ID, kvId));
  parts.push(encodeMessage(KCM_GET_BLOB_RESULT, [getBlobResult]));
  if (requestMetadata && requestMetadata.length > 0) {
    parts.push(encodeBytes(KCM_REQUEST_METADATA, requestMetadata));
  }
  const kcm = encodeMessage(ACM_KV_CLIENT_MESSAGE, parts);
  return wrapConnectFrame(kcm);
}
function encodeKvSetBlobResult(kvId, requestMetadata = null) {
  const parts = [];
  if (kvId !== 0) parts.push(encodeUInt32Field(KCM_ID, kvId));
  parts.push(encodeMessage(KCM_SET_BLOB_RESULT, []));
  if (requestMetadata && requestMetadata.length > 0) {
    parts.push(encodeBytes(KCM_REQUEST_METADATA, requestMetadata));
  }
  const kcm = encodeMessage(ACM_KV_CLIENT_MESSAGE, parts);
  return wrapConnectFrame(kcm);
}
function encodeMcpToolDefinitionBody(def) {
  const parts = [
    encodeString(MTD_NAME, def.name),
    encodeString(MTD_DESCRIPTION, def.description),
    encodeBytes(MTD_INPUT_SCHEMA, def.inputSchemaBytes)
  ];
  if (def.providerIdentifier) {
    parts.push(encodeString(MTD_PROVIDER_IDENTIFIER, def.providerIdentifier));
  }
  if (def.toolName) {
    parts.push(encodeString(MTD_TOOL_NAME, def.toolName));
  }
  return Buffer.concat(parts);
}
function jsonSchemaToProtobufValue(json) {
  return encodeProtobufValue(json);
}
function decodeProtobufValue(buf) {
  let pos = 0;
  while (pos < buf.length) {
    const [t, np] = decodeVarint(buf, pos);
    pos = np;
    const fieldNumber = Number(t >> 3n);
    const wireType = Number(t & 0x7n);
    switch (fieldNumber) {
      case VAL_NULL: {
        if (wireType === WT_VARINT) {
          [, pos] = decodeVarint(buf, pos);
        }
        return null;
      }
      case VAL_NUMBER: {
        if (wireType === 1 && pos + 8 <= buf.length) {
          const value = buf.readDoubleLE(pos);
          pos += 8;
          return value;
        }
        return 0;
      }
      case VAL_STRING: {
        if (wireType === WT_LEN) {
          const [len, np2] = decodeVarint(buf, pos);
          pos = np2;
          const lenN = checkedLen(len, pos, buf);
          const value = buf.subarray(pos, pos + lenN).toString("utf8");
          pos += lenN;
          return value;
        }
        return "";
      }
      case VAL_BOOL: {
        if (wireType === WT_VARINT) {
          const [val, np2] = decodeVarint(buf, pos);
          pos = np2;
          return val !== 0n;
        }
        return false;
      }
      case VAL_STRUCT: {
        if (wireType === WT_LEN) {
          const [len, np2] = decodeVarint(buf, pos);
          pos = np2;
          const lenN = checkedLen(len, pos, buf);
          const inner = buf.subarray(pos, pos + lenN);
          pos += lenN;
          return decodeProtobufStruct(inner);
        }
        return {};
      }
      case VAL_LIST: {
        if (wireType === WT_LEN) {
          const [len, np2] = decodeVarint(buf, pos);
          pos = np2;
          const lenN = checkedLen(len, pos, buf);
          const inner = buf.subarray(pos, pos + lenN);
          pos += lenN;
          return decodeProtobufList(inner);
        }
        return [];
      }
      default:
        if (wireType === WT_VARINT) {
          [, pos] = decodeVarint(buf, pos);
        } else if (wireType === WT_LEN) {
          const [len, np2] = decodeVarint(buf, pos);
          pos = np2;
          pos += Number(len);
        } else if (wireType === 1) {
          pos += 8;
        } else if (wireType === 5) {
          pos += 4;
        }
    }
  }
  return null;
}
function decodeProtobufStruct(buf) {
  const result = {};
  for (const f of decodeFields(buf)) {
    if (f.fieldNumber === STRUCT_FIELDS && f.wireType === 2) {
      let key = "";
      let valueBytes = null;
      for (const entry of decodeFields(f.bytes)) {
        if (entry.fieldNumber === MAP_KEY && entry.wireType === 2) {
          key = entry.bytes.toString("utf8");
        } else if (entry.fieldNumber === MAP_VALUE && entry.wireType === 2) {
          valueBytes = entry.bytes;
        }
      }
      if (key && valueBytes) {
        result[key] = decodeProtobufValue(valueBytes);
      }
    }
  }
  return result;
}
function decodeProtobufList(buf) {
  const result = [];
  for (const f of decodeFields(buf)) {
    if (f.fieldNumber === LIST_VALUES && f.wireType === 2) {
      result.push(decodeProtobufValue(f.bytes));
    }
  }
  return result;
}
function encodeProtobufValue(value) {
  if (value === null || value === void 0) {
    return Buffer.concat([encodeTag(VAL_NULL, WT_VARINT), encodeVarint(0)]);
  }
  if (typeof value === "number") {
    return encodeDoubleField(VAL_NUMBER, value);
  }
  if (typeof value === "string") {
    return encodeString(VAL_STRING, value);
  }
  if (typeof value === "boolean") {
    return Buffer.concat([encodeTag(VAL_BOOL, WT_VARINT), encodeVarint(value ? 1 : 0)]);
  }
  if (Array.isArray(value)) {
    const listParts = value.map((v) => encodeMessage(LIST_VALUES, [encodeProtobufValue(v)]));
    return encodeMessage(VAL_LIST, listParts);
  }
  if (typeof value === "object") {
    const obj = value;
    const structParts = [];
    for (const [k, v] of Object.entries(obj)) {
      const entry = Buffer.concat([
        encodeString(MAP_KEY, k),
        encodeMessage(MAP_VALUE, [encodeProtobufValue(v)])
      ]);
      structParts.push(encodeMessage(STRUCT_FIELDS, [entry]));
    }
    return encodeMessage(VAL_STRUCT, structParts);
  }
  return Buffer.concat([encodeTag(VAL_NULL, WT_VARINT), encodeVarint(0)]);
}
function flattenMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const partsToText = (content) => {
    if (typeof content === "string") return content;
    if (content == null) return "";
    if (!Array.isArray(content)) return "";
    return content.map((p) => typeof p?.text === "string" ? p.text : "").filter(Boolean).join("\n");
  };
  const systemTexts = messages.filter((m) => m.role === "system").map((m) => partsToText(m.content)).filter(Boolean);
  const turn = messages.filter((m) => m.role !== "system");
  if (turn.length === 1 && turn[0].role === "user" && !turn[0].tool_calls) {
    const userText = partsToText(turn[0].content);
    return systemTexts.length > 0 ? `${systemTexts.join("\n\n")}

${userText}` : userText;
  }
  const lines = [];
  for (const m of turn) {
    const text = partsToText(m.content);
    if (m.role === "user") {
      if (text) lines.push(`User: ${text}`);
    } else if (m.role === "assistant") {
      if (text) lines.push(`Assistant: ${text}`);
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const args = tc.function?.arguments ?? "";
          lines.push(
            `Assistant called tool ${tc.function?.name ?? "(unknown)"} (${tc.id}) with arguments: ${args}`
          );
        }
      }
    } else if (m.role === "tool") {
      const callId = m.tool_call_id ?? "(unknown)";
      lines.push(`Tool result (${callId}): ${text}`);
    } else {
      if (text) lines.push(`${m.role}: ${text}`);
    }
  }
  const labelled = lines.join("\n\n");
  return systemTexts.length > 0 ? `${systemTexts.join("\n\n")}

${labelled}` : labelled;
}
export {
  CURSOR_ROUTING_LEVELS,
  CURSOR_ROUTING_LEVEL_PARAMETER_ID,
  buildAgentRequestBody,
  cursorImageAttachmentPath,
  decodeAgentServerMessage,
  decodeExecRequestContext,
  decodeExecServerEvent,
  decodeKvServerEvent,
  decodeProtobufValue,
  encodeAgentRunRequest,
  encodeExecBackgroundShellSpawnRejected,
  encodeExecDeleteRejected,
  encodeExecDiagnosticsResult,
  encodeExecFetchError,
  encodeExecGrepError,
  encodeExecLsRejected,
  encodeExecMcpError,
  encodeExecMcpResult,
  encodeExecReadRejected,
  encodeExecShellRejected,
  encodeExecWriteRejected,
  encodeExecWriteShellStdinError,
  encodeKvGetBlobResult,
  encodeKvSetBlobResult,
  encodeMcpToolDefinitionBody,
  encodeRequestContextResponse,
  encodeSelectedImageBody,
  flattenMessages,
  iterateConnectFrames,
  jsonSchemaToProtobufValue,
  normalizeCursorModelId,
  openAIToolsToMcpDefs,
  resolveRequestedModel,
  wrapConnectFrame
};
