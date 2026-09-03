import { createHash } from "node:crypto";
import { BaseExecutor } from "./base.js";
import { makeExecutorErrorResult as makeErrorResult, sanitizeErrorMessage } from "../utils/errorSanitize.js";
const BASE_URL = "https://chat.minimax.io";
const API_PATH = "/v4/api/chat/msg";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const DEFAULT_CHARACTER_ID = "1";
const DEFAULT_CHAT_ID = "0";
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toStringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}
function md5(input) {
  return createHash("md5").update(input, "utf8").digest("hex");
}
function pyQuote(input) {
  const bytes = new TextEncoder().encode(input);
  let out = "";
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte);
    if (/[A-Za-z0-9_.\-~]/.test(ch)) {
      out += ch;
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}
function getBodyToYy(characterID, msgContent, chatID) {
  const normalized = msgContent.replace(/\r\n/g, "").replace(/\n/g, "").replace(/\r/g, "");
  return md5(characterID) + md5(normalized) + md5(chatID) + md5("");
}
function generateYyHeader(pathAndQuery, bodyToYy, timestampMs) {
  const encodedPath = pyQuote(pathAndQuery);
  const timeHash = md5(String(timestampMs));
  const combined = `${encodedPath}_${bodyToYy}${timeHash}ooui`;
  return md5(combined);
}
function deriveFingerprintId(token, salt) {
  return md5(`${token}:${salt}`);
}
function buildHailuoPathAndQuery(token, providerSpecificData, unixMs) {
  const data = asRecord(providerSpecificData);
  const deviceId = toStringOrEmpty(data.device_id) || toStringOrEmpty(data.deviceId) || deriveFingerprintId(token, "device_id");
  const uuid = toStringOrEmpty(data.uuid) || deriveFingerprintId(token, "uuid");
  const params = new URLSearchParams({
    device_platform: "web",
    biz_id: "2",
    app_id: "3001",
    version_code: "22201",
    lang: "en",
    uuid,
    device_id: deviceId,
    os_name: toStringOrEmpty(data.os_name) || "Windows",
    browser_name: toStringOrEmpty(data.browser_name) || "chrome",
    cpu_core_num: toStringOrEmpty(data.cpu_core_num) || "8",
    browser_language: toStringOrEmpty(data.browser_language) || "en-US",
    browser_platform: toStringOrEmpty(data.browser_platform) || "Win32",
    screen_width: toStringOrEmpty(data.screen_width) || "1920",
    screen_height: toStringOrEmpty(data.screen_height) || "1080",
    unix: String(unixMs)
  });
  return `${API_PATH}?${params.toString()}`;
}
function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    throw new Error("Hailuo Web only supports text message content");
  }
  return content.map((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      throw new Error("Hailuo Web only supports text message content");
    }
    const record = part;
    if ((record.type === "text" || record.type === "input_text") && typeof record.text === "string") {
      return record.text;
    }
    throw new Error("Hailuo Web does not support image, audio, file, or tool content");
  }).join("");
}
function foldHailuoMessages(messages) {
  const parts = [];
  for (const message of messages) {
    if (message.role === "tool" || message.role === "function") {
      throw new Error("Hailuo Web does not support tool result messages");
    }
    if (message.tool_calls !== void 0) {
      throw new Error("Hailuo Web does not support assistant tool calls");
    }
    const text = textFromContent(message.content);
    if (!text) continue;
    if (message.role === "system" || message.role === "developer") {
      parts.push(`System: ${text}`);
    } else if (message.role === "user") {
      parts.push(parts.length > 0 ? `User: ${text}` : text);
    } else if (message.role === "assistant") {
      parts.push(`Assistant: ${text}`);
    } else {
      throw new Error(`Hailuo Web does not support message role ${message.role}`);
    }
  }
  return parts.join("\n\n").trim();
}
function extractHailuoMessageDelta(content, state) {
  if (typeof content !== "string" || content.length <= state.emittedLen) return "";
  const delta = content.slice(state.emittedLen);
  state.emittedLen = content.length;
  return delta;
}
function parseHailuoLine(line) {
  if (line.startsWith("event:")) {
    return { type: "event", value: line.slice(6).trim() };
  }
  if (line.startsWith("data:")) {
    const raw = line.slice(5).trim();
    try {
      return { type: "data", value: JSON.parse(raw) };
    } catch {
      return null;
    }
  }
  return null;
}
function extractHailuoMessageResultContent(data) {
  const root = asRecord(data);
  const payload = asRecord(root.data);
  const messageResult = asRecord(payload.messageResult);
  return typeof messageResult.content === "string" ? messageResult.content : null;
}
function openAiChunk(id, created, modelId, content) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model: modelId,
    choices: [{ index: 0, delta: { content }, finish_reason: null }]
  };
}
function openAiCompletion(id, created, modelId, content) {
  return {
    id,
    object: "chat.completion",
    created,
    model: modelId,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
  };
}
class HailuoWebExecutor extends BaseExecutor {
  constructor() {
    super("hailuo-web", { id: "hailuo-web", baseUrl: BASE_URL });
  }
  buildStreamHeaders(token, yy) {
    return {
      Accept: "text/event-stream",
      "User-Agent": USER_AGENT,
      Origin: BASE_URL,
      Referer: `${BASE_URL}/`,
      token,
      yy
    };
  }
  async streamToText(upstream, onDelta) {
    const reader = upstream.body?.getReader();
    if (!reader) return { ok: true };
    const decoder = new TextDecoder();
    const state = { emittedLen: 0 };
    let currentEvent = "";
    let buffer = "";
    const processLine = (line) => {
      const parsed = parseHailuoLine(line);
      if (!parsed) return "continue";
      if (parsed.type === "event") {
        currentEvent = parsed.value;
        if (currentEvent === "close_chunk") return "close";
        return "continue";
      }
      if (currentEvent === "message_result") {
        const content = extractHailuoMessageResultContent(parsed.value);
        if (content !== null) {
          const delta = extractHailuoMessageDelta(content, state);
          if (delta) onDelta(delta);
        }
      }
      return "continue";
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (processLine(line) === "close") return { ok: true };
        }
      }
      if (buffer) processLine(buffer);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        errorMessage: error instanceof Error ? error.message : "Hailuo stream read failed"
      };
    }
  }
  /** Validate tool/function-call fields and fold messages into a single msgContent string. */
  prepareMsgContent(bodyObj) {
    const tools = bodyObj.tools;
    const functions = bodyObj.functions;
    if (tools != null && (!Array.isArray(tools) || tools.length > 0)) {
      return { error: "Hailuo Web does not support OpenAI function tools" };
    }
    if (functions != null && (!Array.isArray(functions) || functions.length > 0)) {
      return { error: "Hailuo Web does not support legacy function tools" };
    }
    try {
      const messages = Array.isArray(bodyObj.messages) ? bodyObj.messages : [];
      const msgContent = foldHailuoMessages(messages);
      if (!msgContent) throw new Error("Hailuo Web requires a non-empty user message");
      return { msgContent };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Invalid Hailuo Web request" };
    }
  }
  /** Build the signed request: URL, headers, and the multipart form body. */
  buildSignedRequest(token, providerSpecificData, msgContent) {
    const now = Date.now();
    const pathAndQuery = buildHailuoPathAndQuery(token, providerSpecificData, now);
    const psd = asRecord(providerSpecificData);
    const characterID = toStringOrEmpty(psd.characterID) || DEFAULT_CHARACTER_ID;
    const chatID = toStringOrEmpty(psd.chatID) || DEFAULT_CHAT_ID;
    const bodyToYy = getBodyToYy(characterID, msgContent, chatID);
    const yy = generateYyHeader(pathAndQuery, bodyToYy, now);
    const form = new FormData();
    form.set("characterID", characterID);
    form.set("msgContent", msgContent);
    form.set("chatID", chatID);
    form.set("searchMode", "0");
    return { url: `${BASE_URL}${pathAndQuery}`, headers: this.buildStreamHeaders(token, yy), form };
  }
  /** POST the signed multipart request and normalize both network + upstream-status errors. */
  async dispatch(url, reqHeaders, form, signal, body, bodyObj) {
    let upstream;
    try {
      upstream = await fetch(url, { method: "POST", headers: reqHeaders, body: form, signal });
    } catch (err) {
      return {
        errorResult: {
          ...makeErrorResult(
            502,
            `Hailuo fetch failed: ${err instanceof Error ? err.message : "unknown"}`,
            body,
            url
          ),
          headers: reqHeaders,
          transformedBody: bodyObj
        }
      };
    }
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return {
        errorResult: {
          ...makeErrorResult(
            upstream.status,
            `Hailuo error: ${sanitizeErrorMessage(errText)}`,
            body,
            url
          ),
          headers: reqHeaders,
          transformedBody: bodyObj
        }
      };
    }
    return { upstream };
  }
  /** Buffer the SSE stream into a single OpenAI-shaped chat.completion response. */
  async buildNonStreamingResponse(upstream, id, created, modelId, url, reqHeaders, body, bodyObj) {
    let answer = "";
    const result = await this.streamToText(upstream, (delta) => {
      answer += delta;
    });
    if (!result.ok) {
      return {
        ...makeErrorResult(
          502,
          `Hailuo protocol error: ${sanitizeErrorMessage(result.errorMessage || "unknown")}`,
          body,
          url
        ),
        headers: reqHeaders,
        transformedBody: bodyObj
      };
    }
    return {
      response: new Response(JSON.stringify(openAiCompletion(id, created, modelId, answer)), {
        headers: { "Content-Type": "application/json" }
      }),
      url,
      headers: reqHeaders,
      transformedBody: bodyObj
    };
  }
  buildStreamingResponse(upstream, id, created, modelId, signal) {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start: async (controller) => {
        let emittedRole = false;
        const result = await this.streamToText(upstream, (delta) => {
          if (!emittedRole) {
            emittedRole = true;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(openAiChunk(id, created, modelId, ""))}

`)
            );
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(openAiChunk(id, created, modelId, delta))}

`)
          );
        });
        if (!result.ok) {
          if (!signal?.aborted) {
            controller.error(new Error(result.errorMessage || "Hailuo stream error"));
          } else {
            try {
              controller.close();
            } catch {
            }
          }
          return;
        }
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id,
              object: "chat.completion.chunk",
              created,
              model: modelId,
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
            })}

`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
  }
  async execute(input) {
    const { body, credentials, signal, stream: wantStream } = input;
    const bodyObj = asRecord(body);
    const token = toStringOrEmpty(credentials?.apiKey) || toStringOrEmpty(credentials?.accessToken);
    if (!token) {
      return makeErrorResult(
        401,
        "Missing Hailuo _token \u2014 log in at hailuo.ai and capture _token from localStorage.",
        body,
        `${BASE_URL}${API_PATH}`
      );
    }
    const prepared = this.prepareMsgContent(bodyObj);
    if ("error" in prepared) {
      return makeErrorResult(400, prepared.error, body, BASE_URL);
    }
    const { url, headers: reqHeaders, form } = this.buildSignedRequest(
      token,
      credentials?.providerSpecificData,
      prepared.msgContent
    );
    const dispatched = await this.dispatch(url, reqHeaders, form, signal, body, bodyObj);
    if ("errorResult" in dispatched) return dispatched.errorResult;
    const { upstream } = dispatched;
    const id = `chatcmpl-hailuo-${Date.now()}`;
    const created = Math.floor(Date.now() / 1e3);
    const modelId = input.model || "hailuo";
    if (wantStream) {
      const outStream = this.buildStreamingResponse(upstream, id, created, modelId, signal);
      return {
        response: new Response(outStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive"
          }
        }),
        url,
        headers: reqHeaders,
        transformedBody: bodyObj
      };
    }
    return this.buildNonStreamingResponse(upstream, id, created, modelId, url, reqHeaders, body, bodyObj);
  }
}
export {
  HailuoWebExecutor,
  buildHailuoPathAndQuery,
  extractHailuoMessageDelta,
  extractHailuoMessageResultContent,
  foldHailuoMessages,
  generateYyHeader,
  getBodyToYy,
  parseHailuoLine,
  pyQuote
};
