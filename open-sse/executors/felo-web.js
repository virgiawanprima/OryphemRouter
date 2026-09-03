import { randomUUID } from "node:crypto";
import { BaseExecutor } from "./base.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
const FELO_BASE = "https://felo.ai";
const FELO_THREADS_URL = `${FELO_BASE}/api-proxy/main/search/threads`;
const FELO_PROVIDER_PREFIX = "felo-web/";
function feloStreamUrl(streamKey) {
  return `${FELO_BASE}/api/message/v1/stream/${encodeURIComponent(streamKey)}?offset=0`;
}
const FELO_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
const FELO_HEADERS = {
  Accept: "*/*",
  "Content-Type": "application/json",
  Origin: FELO_BASE,
  Referer: `${FELO_BASE}/search?q=hello`,
  "User-Agent": FELO_USER_AGENT
};
const FELO_STREAM_REQUEST_HEADERS = {
  Accept: "*/*",
  Origin: FELO_BASE,
  Referer: FELO_HEADERS.Referer,
  "User-Agent": FELO_USER_AGENT
};
const FELO_MODEL_CATEGORIES = {
  "felo-chat": "chat",
  "felo-search": "google",
  "felo-scholar": "scholar",
  "felo-social": "social",
  "felo-document": "document"
};
const FELO_DEFAULT_MODEL = "felo-chat";
function normalizeFeloModel(model) {
  if (!model) return FELO_DEFAULT_MODEL;
  const clean = model.startsWith(FELO_PROVIDER_PREFIX) ? model.slice(FELO_PROVIDER_PREFIX.length) : model;
  return Object.prototype.hasOwnProperty.call(FELO_MODEL_CATEGORIES, clean) ? clean : FELO_DEFAULT_MODEL;
}
function resolveFeloCategory(model) {
  return FELO_MODEL_CATEGORIES[normalizeFeloModel(model)];
}
function extractFeloLastUserPrompt(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  const content = lastUser.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (part && typeof part === "object" && typeof part.text === "string") {
      return part.text;
    }
    return "";
  }).filter(Boolean).join("\n");
}
function buildFeloThreadPayload(model, prompt) {
  const searchUuid = randomUUID();
  return {
    query: prompt,
    search_uuid: searchUuid,
    lang: "",
    agent_lang: "en",
    search_options: { langcode: "en-US" },
    search_video: true,
    query_from: "default",
    category: resolveFeloCategory(model),
    model: "",
    auto_routing: true,
    mode: "concise",
    device_id: randomUUID().replaceAll("-", ""),
    source_message_rid: "",
    documents: [],
    document_action: "",
    slides_source: { type: "ask_question", files: {} },
    slide_template_uid: "",
    selected_resource_ids: [],
    process_id: searchUuid,
    stream_protocol: "message_center_v1",
    enable_task_state: true
  };
}
function extractFeloAnswerText(contentJson) {
  if (!contentJson || typeof contentJson !== "object") return null;
  const data = contentJson.data;
  if (!data || typeof data !== "object") return null;
  const dataRecord = data;
  if (dataRecord.type !== "answer") return null;
  const inner = dataRecord.data;
  if (!inner || typeof inner !== "object") return null;
  const text = inner.text;
  return typeof text === "string" ? text : null;
}
function parseFeloStreamLine(line, previousText) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:{")) {
    return { newText: null, nextPreviousText: previousText };
  }
  let outer;
  try {
    outer = JSON.parse(trimmed.slice(5));
  } catch {
    return { newText: null, nextPreviousText: previousText };
  }
  const content = outer?.content;
  if (typeof content !== "string") {
    return { newText: null, nextPreviousText: previousText };
  }
  let contentJson;
  try {
    contentJson = JSON.parse(content);
  } catch {
    return { newText: null, nextPreviousText: previousText };
  }
  const text = extractFeloAnswerText(contentJson);
  if (text === null) {
    return { newText: null, nextPreviousText: previousText };
  }
  if (text.startsWith(previousText)) {
    const newPart = text.slice(previousText.length);
    return newPart ? { newText: newPart, nextPreviousText: text } : { newText: null, nextPreviousText: previousText };
  }
  return { newText: text, nextPreviousText: text };
}
function accumulateFeloStreamText(rawText) {
  let previousText = "";
  for (const line of rawText.split("\n")) {
    previousText = parseFeloStreamLine(line, previousText).nextPreviousText;
  }
  return previousText;
}
class FeloWebExecutor extends BaseExecutor {
  constructor() {
    super("felo-web", { baseUrl: FELO_BASE });
  }
  async testConnection(_credentials, signal) {
    const controller = new AbortController();
    const feloTestMs = this.getTimeoutMs();
    const timeout = setTimeout(() => {
      const err = new Error(`felo-web testConnection timeout after ${feloTestMs}ms`);
      err.name = "TimeoutError";
      controller.abort(err);
    }, feloTestMs);
    try {
      const mergedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      const response = await fetch(FELO_THREADS_URL, {
        method: "POST",
        headers: FELO_HEADERS,
        body: JSON.stringify(buildFeloThreadPayload(FELO_DEFAULT_MODEL, "hi")),
        signal: mergedSignal
      });
      if (!response.ok) return false;
      const data = await response.json().catch(() => null);
      return typeof data?.stream_key === "string";
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
  async execute(input) {
    const { model, body, stream, signal } = input;
    const bodyObj = body || {};
    const messages = Array.isArray(bodyObj.messages) ? bodyObj.messages : [];
    const isStreaming = stream !== false;
    if (messages.length === 0) {
      return feloErrorResponse(400, "No messages provided");
    }
    const prompt = extractFeloLastUserPrompt(messages);
    if (!prompt) {
      return feloErrorResponse(400, "No user message content found");
    }
    const controller = new AbortController();
    const feloExecMs = this.getTimeoutMs();
    const timeout = setTimeout(() => {
      const err = new Error(`felo-web execute timeout after ${feloExecMs}ms`);
      err.name = "TimeoutError";
      controller.abort(err);
    }, feloExecMs);
    const mergedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      const streamKey = await this.createFeloThread(model, prompt, mergedSignal);
      if (streamKey instanceof Response) {
        clearTimeout(timeout);
        return streamKey;
      }
      const streamResponse = await fetch(feloStreamUrl(streamKey), {
        method: "GET",
        headers: FELO_STREAM_REQUEST_HEADERS,
        signal: mergedSignal
      });
      clearTimeout(timeout);
      if (!streamResponse.ok || !streamResponse.body) {
        const status = !streamResponse.ok && streamResponse.status >= 500 ? 502 : streamResponse.status || 502;
        return feloErrorResponse(status, `Felo stream request failed with HTTP ${streamResponse.status}`);
      }
      return await processFeloResponse(streamResponse, isStreaming);
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === "AbortError") {
        return feloErrorResponse(499, "Request cancelled");
      }
      return feloErrorResponse(500, error instanceof Error ? error.message : "Unknown error");
    }
  }
  /** Returns the resolved `stream_key`, or an error Response to propagate as-is. */
  async createFeloThread(model, prompt, signal) {
    const threadResponse = await fetch(FELO_THREADS_URL, {
      method: "POST",
      headers: FELO_HEADERS,
      body: JSON.stringify(buildFeloThreadPayload(model, prompt)),
      signal
    });
    if (!threadResponse.ok) {
      const status = threadResponse.status >= 500 ? 502 : threadResponse.status;
      return feloErrorResponse(status, `Felo thread creation failed with HTTP ${threadResponse.status}`);
    }
    const threadJson = await threadResponse.json().catch(() => null);
    const streamKey = threadJson?.stream_key;
    if (typeof streamKey !== "string" || !streamKey) {
      return feloErrorResponse(502, "Felo did not return a stream_key");
    }
    return streamKey;
  }
}
function feloErrorResponse(status, message) {
  return new Response(JSON.stringify({ error: { message: sanitizeErrorMessage(message) } }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function buildFeloStreamTransform() {
  let previousText = "";
  let buffer = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const parsed = parseFeloStreamLine(line, previousText);
        previousText = parsed.nextPreviousText;
        if (!parsed.newText) continue;
        const openaiChunk = { choices: [{ delta: { content: parsed.newText }, index: 0 }] };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}

`));
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    }
  });
}
async function processFeloResponse(response, streaming) {
  if (streaming) {
    if (!response.body) {
      return feloErrorResponse(500, "No response body");
    }
    const transformed = response.body.pipeThrough(buildFeloStreamTransform());
    return new Response(transformed, { headers: { "Content-Type": "text/event-stream" } });
  }
  const rawText = await response.text();
  const fullText = accumulateFeloStreamText(rawText);
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { role: "assistant", content: fullText },
          index: 0,
          finish_reason: "stop"
        }
      ]
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
const feloWebExecutor = new FeloWebExecutor();
export {
  FELO_BASE,
  FELO_DEFAULT_MODEL,
  FELO_HEADERS,
  FELO_PROVIDER_PREFIX,
  FELO_THREADS_URL,
  FeloWebExecutor,
  accumulateFeloStreamText,
  buildFeloThreadPayload,
  extractFeloLastUserPrompt,
  feloStreamUrl,
  feloWebExecutor,
  normalizeFeloModel,
  parseFeloStreamLine,
  resolveFeloCategory
};
