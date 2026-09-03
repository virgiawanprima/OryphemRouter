import { createHash, randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BaseExecutor } from "./base.js";
import { makeExecutorErrorResult as makeErrorResult } from "../utils/errorSanitize.js";
import {
  HYPERAGENT_FALLBACK_MODELS,
  clientFacingHyperAgentModelId,
  wireHyperAgentModelId,
  wireHyperAgentRuntimeId,
  wireHyperAgentSubagentModelId
} from "../services/hyperagentModels.js";
const ORIGIN = "https://hyperagent.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const THREAD_CACHE_MAX = 200;
function readStr(v) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length ? t : "";
}
function readPs(data, keys) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const rec = data;
  for (const k of keys) {
    const v = readStr(rec[k]);
    if (v) return v;
  }
  return "";
}
function normalizeHyperAgentCookie(raw) {
  const t = (raw || "").trim();
  if (!t) return "";
  return t.replace(/^Cookie:\s*/i, "").trim();
}
function resolveHyperAgentCredentials(credentials) {
  const direct = readStr(credentials?.apiKey) || readStr(credentials?.cookie) || readStr(credentials?.accessToken);
  const ps = credentials?.providerSpecificData;
  const cookie = normalizeHyperAgentCookie(
    direct || readPs(ps, ["cookie", "sessionCookie", "authCookie", "Cookie"])
  );
  return { cookie };
}
function extractMessageText(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const p = part;
      const type = typeof p.type === "string" ? p.type.toLowerCase() : "";
      if (type === "tool_result" || type === "function_result") {
        const name = typeof p.name === "string" ? p.name : "tool";
        const body = extractMessageText(p.content ?? p.output ?? p.result ?? "");
        return body ? `[tool result ${name}]
${body}` : `[tool result ${name}]`;
      }
      if (type === "tool_use" || type === "function_call" || type === "tool_call") {
        const name = typeof p.name === "string" ? p.name : "tool";
        let args = "";
        if (p.input != null) {
          try {
            args = typeof p.input === "string" ? p.input : JSON.stringify(p.input);
          } catch {
            args = String(p.input);
          }
        } else if (typeof p.arguments === "string") {
          args = p.arguments;
        }
        return args ? `[tool call ${name}] ${args}` : `[tool call ${name}]`;
      }
      if (typeof p.text === "string") return p.text;
      if (typeof p.content === "string") return p.content;
      if (p.content != null && typeof p.content !== "string") {
        return extractMessageText(p.content);
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  if (content && typeof content === "object") {
    const o = content;
    if (typeof o.text === "string") return o.text;
    if (typeof o.content === "string") return o.content;
  }
  return "";
}
function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = (messages[i]?.role || "").toLowerCase();
    if (role === "user" || role === "human" || role === "tool" || role === "function") {
      return extractMessageText(messages[i].content).trim();
    }
  }
  return "";
}
const memoryThreads = /* @__PURE__ */ new Map();
function threadCachePath() {
  const dataDir = process.env.DATA_DIR || process.env.OMNIROUTE_DATA_DIR;
  if (!dataDir) return null;
  return join(dataDir, "hyperagent-thread-sessions.json");
}
async function loadThreadDisk() {
  const p = threadCachePath();
  if (!p || !(await access(p).then(() => true).catch(() => false))) return {};
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return {};
  }
}
async function saveThreadDisk(map) {
  const p = threadCachePath();
  if (!p) return;
  try {
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(map), "utf8");
  } catch {
  }
}
async function getThreadBinding(key) {
  if (!key) return null;
  const mem = memoryThreads.get(key);
  if (mem) return mem;
  const disk = await loadThreadDisk();
  const cached = disk[key];
  if (cached) {
    memoryThreads.set(key, cached);
    return cached;
  }
  return null;
}
async function setThreadBinding(key, binding) {
  if (!key) return;
  memoryThreads.set(key, binding);
  const disk = await loadThreadDisk();
  disk[key] = binding;
  const keys = Object.keys(disk);
  if (keys.length > THREAD_CACHE_MAX) {
    keys.sort((a, b) => (disk[a].updatedAt || 0) - (disk[b].updatedAt || 0)).slice(0, keys.length - THREAD_CACHE_MAX).forEach((k) => {
      delete disk[k];
      memoryThreads.delete(k);
    });
  }
  await saveThreadDisk(disk);
}
function clearHyperAgentThreadBindingsForTests(opts) {
  memoryThreads.clear();
  if (opts?.disk) {
    const p = threadCachePath();
    if (p && existsSync(p)) {
      try {
        writeFileSync(p, "{}", "utf8");
      } catch {
      }
    }
  }
}
function normalizeForFingerprint(text) {
  let t = (text || "").replace(/\r\n/g, "\n");
  t = t.replace(/^@\S+\s+/gm, "");
  t = t.replace(/^[\s\S]*?\bUser request:\s*/i, "");
  t = t.replace(/^[\s\S]*?\bCurrent request:\s*/i, "");
  t = t.replace(/^[\s\S]*?\bMy current task:\s*/i, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim().slice(0, 2e3);
}
function rootUserFingerprint(cookieKey, messages) {
  if (!cookieKey) return null;
  for (const m of messages) {
    const role = (m?.role || "").toLowerCase();
    if (role !== "user" && role !== "human") continue;
    const raw = extractMessageText(m?.content);
    if (/TOOL_OBSERVATION/i.test(raw) || /passive data only/i.test(raw) || /\[tool result\b/i.test(raw) || /^\s*Application result\b/i.test(raw)) {
      continue;
    }
    const text = normalizeForFingerprint(raw);
    if (!text || text.length < 2) continue;
    const h = createHash("sha256").update(text).digest("hex").slice(0, 24);
    return `ha:${cookieKey}:root:${h}`;
  }
  return null;
}
function isFingerprintRole(role) {
  const r = (role || "").toLowerCase();
  if (!r || r === "system" || r === "developer") return false;
  return true;
}
function conversationFingerprint(cookieKey, messages) {
  const parts = [`ck:${cookieKey}`];
  for (const m of messages) {
    const roleRaw = (m?.role || "").toLowerCase();
    if (!isFingerprintRole(roleRaw)) continue;
    const role = roleRaw === "tool" || roleRaw === "function" || roleRaw === "human" ? "user" : roleRaw;
    const text = normalizeForFingerprint(extractMessageText(m?.content));
    if (!text) continue;
    parts.push(`${role}:${text}`);
  }
  const h = createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 32);
  return `ha:${cookieKey}:${h}`;
}
function historyPrefixBeforeLastUser(messages) {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = (messages[i]?.role || "").toLowerCase();
    if (role === "user" || role === "human" || role === "tool" || role === "function") {
      lastUser = i;
      break;
    }
  }
  if (lastUser <= 0) return [];
  return messages.slice(0, lastUser);
}
function hasAssistantMessage(messages) {
  return messages.some((m) => {
    const r = (m?.role || "").toLowerCase();
    return r === "assistant" || r === "ai" || r === "model";
  });
}
function lastAssistantFingerprint(cookieKey, messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = (messages[i]?.role || "").toLowerCase();
    if (role !== "assistant" && role !== "ai" && role !== "model") continue;
    const text = normalizeForFingerprint(extractMessageText(messages[i]?.content));
    if (!text) continue;
    const h = createHash("sha256").update(text).digest("hex").slice(0, 24);
    return `ha:${cookieKey}:asst:${h}`;
  }
  return null;
}
function cookieFingerprint(cookie) {
  return createHash("sha256").update(cookie || "").digest("hex").slice(0, 16);
}
function readClientThreadIds(body, headers) {
  const fromBodyThread = readStr(body.hyperagent_thread_id) || readStr(body.thread_id);
  const fromBodySession = readStr(body.hyperagent_session_id) || readStr(body.session_id);
  if (!headers) return { threadId: fromBodyThread, sessionId: fromBodySession };
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v ?? "");
  const threadId = fromBodyThread || readStr(lower["x-hyperagent-thread-id"]) || readStr(lower["x-thread-id"]) || "";
  const sessionId = fromBodySession || readStr(lower["x-hyperagent-session-id"]) || readStr(lower["x-session-id"]) || "";
  return { threadId, sessionId };
}
async function resolveHyperAgentThreadBinding(cookieKey, messages, clientThreadId, clientSessionId) {
  const clientId = (clientThreadId || "").trim();
  const clientSess = (clientSessionId || "").trim();
  const prefix = historyPrefixBeforeLastUser(messages);
  const prefixKey = prefix.length > 0 && hasAssistantMessage(prefix) ? conversationFingerprint(cookieKey, prefix) : null;
  const rootKey = rootUserFingerprint(cookieKey, messages);
  if (clientId) {
    return {
      threadId: clientId,
      sessionId: clientSess,
      isFollowUp: true,
      prefixKey: prefixKey || rootKey
    };
  }
  if (prefixKey) {
    const cached = await getThreadBinding(prefixKey);
    if (cached?.threadId && cached.projectKey === cookieKey) {
      return {
        threadId: cached.threadId,
        sessionId: cached.sessionId || clientSess,
        isFollowUp: true,
        prefixKey
      };
    }
  }
  if (rootKey && hasAssistantMessage(messages)) {
    const cached = await getThreadBinding(rootKey);
    if (cached?.threadId && cached.projectKey === cookieKey) {
      return {
        threadId: cached.threadId,
        sessionId: cached.sessionId || clientSess,
        isFollowUp: true,
        prefixKey: rootKey
      };
    }
  }
  if (hasAssistantMessage(messages)) {
    const asstKey = lastAssistantFingerprint(cookieKey, prefix.length ? prefix : messages);
    if (asstKey) {
      const cached = await getThreadBinding(asstKey);
      if (cached?.threadId && cached.projectKey === cookieKey) {
        return {
          threadId: cached.threadId,
          sessionId: cached.sessionId || clientSess,
          isFollowUp: true,
          prefixKey: asstKey
        };
      }
    }
  }
  return { threadId: "", sessionId: "", isFollowUp: false, prefixKey: null };
}
async function storeHyperAgentThreadAfterTurn(cookieKey, messages, assistantText, threadId, sessionId) {
  if (!cookieKey || !threadId) return null;
  const full = [...messages, { role: "assistant", content: assistantText || "" }];
  if (!hasAssistantMessage(full) || !messages.some((m) => {
    const r = (m.role || "").toLowerCase();
    return r === "user" || r === "human" || r === "tool" || r === "function";
  })) {
    return null;
  }
  const binding = {
    threadId,
    sessionId: sessionId || "",
    projectKey: cookieKey,
    updatedAt: Date.now()
  };
  const key = conversationFingerprint(cookieKey, full);
  await setThreadBinding(key, binding);
  const prefix = historyPrefixBeforeLastUser(messages);
  if (prefix.length > 0 && hasAssistantMessage(prefix)) {
    await setThreadBinding(conversationFingerprint(cookieKey, prefix), binding);
  }
  const asstKey = lastAssistantFingerprint(cookieKey, full);
  if (asstKey) await setThreadBinding(asstKey, binding);
  const rootKey = rootUserFingerprint(cookieKey, messages);
  if (rootKey) await setThreadBinding(rootKey, binding);
  return key;
}
function browserHeaders(cookie, extra) {
  return {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    cookie,
    origin: ORIGIN,
    referer: `${ORIGIN}/`,
    "user-agent": USER_AGENT,
    ...extra
  };
}
async function createHyperAgentThread(cookie, signal) {
  try {
    const res = await fetch(`${ORIGIN}/api/threads`, {
      method: "POST",
      headers: browserHeaders(cookie, {
        "content-type": "application/json",
        "x-request-id": randomUUID()
      }),
      body: JSON.stringify({}),
      signal: signal ?? void 0,
      redirect: "manual"
    });
    const loc = res.headers.get("location") || res.headers.get("Location") || "";
    const fromLoc = extractThreadIdFromUrl(loc);
    if (fromLoc) return fromLoc;
    if (res.ok) {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        const id = readStr(j.id) || readStr(j.threadId) || readStr(j.thread_id) || (j.thread && typeof j.thread === "object" ? readStr(j.thread.id) : "");
        if (id) return id;
      } catch {
        const m = text.match(/cm[a-z0-9]{20,}/i);
        if (m) return m[0];
      }
    }
  } catch {
  }
  const res2 = await fetch(`${ORIGIN}/threads/new`, {
    method: "GET",
    headers: browserHeaders(cookie, {
      rsc: "1",
      "next-url": "/",
      "x-request-id": randomUUID()
    }),
    signal: signal ?? void 0,
    redirect: "manual"
  });
  const loc2 = res2.headers.get("location") || res2.headers.get("Location") || res2.headers.get("x-middleware-rewrite") || "";
  const fromLoc2 = extractThreadIdFromUrl(loc2);
  if (fromLoc2) return fromLoc2;
  if (res2.status >= 200 && res2.status < 400) {
    const text = await res2.text().catch(() => "");
    const m = text.match(/\/thread\/(cm[a-z0-9]{20,})/i) || text.match(/"(cm[a-z0-9]{20,})"/i);
    if (m) return m[1];
  }
  throw new Error(
    `Could not create HyperAgent thread (HTTP ${res2.status}). Ensure the session Cookie is valid and not expired.`
  );
}
async function configureHyperAgentThread(cookie, threadId, opts, signal) {
  const body = {
    modelId: opts.modelId,
    defaultSubagentModel: opts.subagentModelId,
    runtimeId: opts.runtimeId || "claude-agents-sdk"
  };
  if (opts.executionMode === "auto") body.executionMode = "auto";
  else if (opts.executionMode === null) body.executionMode = null;
  const res = await fetch(`${ORIGIN}/api/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    headers: browserHeaders(cookie, {
      "content-type": "application/json",
      "x-request-id": randomUUID(),
      referer: `${ORIGIN}/thread/${threadId}`
    }),
    body: JSON.stringify(body),
    signal: signal ?? void 0
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `HyperAgent configure thread HTTP ${res.status}: ${errText.slice(0, 300) || res.statusText}`
    );
  }
}
function extractThreadIdFromUrl(url) {
  if (!url) return "";
  const m = url.match(/\/thread\/([A-Za-z0-9_-]{10,})/i) || url.match(/(cm[a-z0-9]{20,})/i);
  return m ? m[1] : "";
}
function buildHyperAgentChatBody(opts) {
  return {
    sessionId: opts.sessionId,
    unifiedStream: true,
    searchMode: "exa",
    enableExecuteScript: false,
    enablePersistentSandbox: true,
    enableWebpage: true,
    enableSlides: true,
    tablesEnabled: true,
    enableWebSearch: true,
    enableBrowser: true,
    enableImageGeneration: true,
    enableVideoGeneration: true,
    enableAudioGeneration: true,
    enableTranscription: true,
    enableAvatarVideo: true,
    enableExaFindSimilar: true,
    enableExaAnswer: true,
    enableExaResearch: true,
    enableExaWebsets: true,
    enableGeoTools: true,
    hyperAppsEnabled: false,
    documentsEnabled: true,
    enableThreadSearch: true,
    residentialProxyEnabled: false,
    solveCaptchasEnabled: true,
    content: opts.content,
    debug: false,
    // No connectors — empty list (SPA execution capture).
    enabledIntegrations: [],
    integrationMode: "open",
    globalTablesEnabled: true
    // NO injectPlanMode → execution mode (plan mode was injectPlanMode:true).
    // NO modelId / model → set via configureHyperAgentThread PATCH.
  };
}
async function parseHyperAgentSseStream(response) {
  if (!response.body) {
    throw new Error("Empty HyperAgent stream body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sessionId = "";
  let modelId = "";
  let events = 0;
  const handleData = (payload) => {
    const trimmed = payload.trim();
    if (!trimmed || trimmed === "[DONE]") return;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return;
    }
    events += 1;
    const type = readStr(obj.type);
    if (type === "text") {
      text += typeof obj.content === "string" ? obj.content : "";
    } else if (type === "session_start") {
      const sid = readStr(obj.sessionId);
      if (sid) sessionId = sid;
    } else if (type === "thread_runtime_latched") {
      const mid = readStr(obj.modelId);
      if (mid) modelId = mid;
    } else if (type === "error" || type === "stream_error") {
      const msg = readStr(obj.content) || readStr(obj.message) || readStr(obj.error) || "HyperAgent stream error";
      throw new Error(msg);
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const t = line.trimEnd();
      if (t.startsWith("data:")) {
        handleData(t.slice(5).trimStart());
      }
    }
  }
  if (buffer.trim()) {
    const t = buffer.trim();
    if (t.startsWith("data:")) handleData(t.slice(5).trimStart());
  }
  return { text, sessionId, modelId, events };
}
function estimateUsage(messages, content) {
  const prompt = (messages || []).map((m) => extractMessageText(m.content)).join("\n");
  const prompt_tokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completion_tokens = Math.max(1, Math.ceil(content.length / 4));
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
    estimated: true
  };
}
function chatCompletionResponse(content, model, messages, threadId, sessionId) {
  const id = threadId ? `chatcmpl-ha-${threadId}` : `chatcmpl-ha-${Date.now()}`;
  return new Response(
    JSON.stringify({
      id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1e3),
      model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: estimateUsage(messages, content),
      hyperagent_thread_id: threadId || void 0,
      hyperagent_session_id: sessionId || void 0
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...threadId ? { "X-HyperAgent-Thread-Id": threadId } : {},
        ...sessionId ? { "X-HyperAgent-Session-Id": sessionId } : {}
      }
    }
  );
}
function pseudoStreamResponse(content, model, threadId, sessionId) {
  const encoder = new TextEncoder();
  const id = threadId ? `chatcmpl-ha-${threadId}` : `chatcmpl-ha-${Date.now()}`;
  const chunk = (delta, finishReason) => ({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [{ index: 0, delta: delta ? { content: delta } : {}, finish_reason: finishReason }]
  });
  const readable = new ReadableStream({
    start(controller) {
      const parts = content.match(/\S+\s*/g) || [content];
      let buf = "";
      for (const p of parts) {
        buf += p;
        if (buf.length >= 40) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk(buf, null))}

`));
          buf = "";
        }
      }
      if (buf) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk(buf, null))}

`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk("", "stop"))}

`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...threadId ? { "X-HyperAgent-Thread-Id": threadId } : {},
      ...sessionId ? { "X-HyperAgent-Session-Id": sessionId } : {}
    }
  });
}
class HyperAgentExecutor extends BaseExecutor {
  constructor() {
    super("hyperagent", {
      id: "hyperagent",
      baseUrl: `${ORIGIN}/api/threads`
    });
  }
  async execute(input) {
    const { model, body, stream: wantStream, credentials, signal } = input;
    const requestBody = body || {};
    const { cookie } = resolveHyperAgentCredentials(credentials);
    if (!cookie) {
      return makeErrorResult(
        401,
        "Missing HyperAgent session cookie \u2014 paste the full Cookie header from hyperagent.com (DevTools \u2192 Network \u2192 any document request \u2192 Request Headers \u2192 Cookie)",
        body,
        `${ORIGIN}/api/threads`
      );
    }
    const messages = requestBody.messages || [];
    const userText = lastUserText(messages);
    if (!userText) {
      return makeErrorResult(400, "No user message found", body, `${ORIGIN}/api/threads`);
    }
    const clientFacing = clientFacingHyperAgentModelId(model || requestBody.model);
    const wireModel = wireHyperAgentModelId(model || requestBody.model);
    const subagentModel = wireHyperAgentSubagentModelId(model || requestBody.model);
    const runtimeId = wireHyperAgentRuntimeId(model || requestBody.model);
    const cookieKey = cookieFingerprint(cookie);
    const inboundHeaders = input.clientHeaders ?? input.headers;
    const clientIds = readClientThreadIds(requestBody, inboundHeaders ?? void 0);
    const binding = await resolveHyperAgentThreadBinding(
      cookieKey,
      messages,
      clientIds.threadId,
      clientIds.sessionId
    );
    let threadId = binding.threadId;
    let sessionId = binding.sessionId || null;
    try {
      if (!binding.isFollowUp || !threadId) {
        threadId = await createHyperAgentThread(cookie, signal);
        sessionId = null;
      }
      await configureHyperAgentThread(
        cookie,
        threadId,
        {
          modelId: wireModel,
          subagentModelId: subagentModel,
          runtimeId,
          executionMode: "auto"
        },
        signal
      );
      const chatUrl = `${ORIGIN}/api/threads/${encodeURIComponent(threadId)}/chat`;
      const chatBody = buildHyperAgentChatBody({
        content: userText,
        sessionId
      });
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: browserHeaders(cookie, {
          "content-type": "application/json",
          referer: `${ORIGIN}/thread/${threadId}`,
          "x-request-id": randomUUID()
        }),
        body: JSON.stringify(chatBody),
        signal: signal ?? void 0
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 404 || /not found|unknown thread/i.test(errText)) {
          threadId = await createHyperAgentThread(cookie, signal);
          sessionId = null;
          await configureHyperAgentThread(
            cookie,
            threadId,
            {
              modelId: wireModel,
              subagentModelId: subagentModel,
              runtimeId,
              executionMode: "auto"
            },
            signal
          );
          const retryUrl = `${ORIGIN}/api/threads/${encodeURIComponent(threadId)}/chat`;
          const retryBody = buildHyperAgentChatBody({
            content: userText,
            sessionId: null
          });
          const res2 = await fetch(retryUrl, {
            method: "POST",
            headers: browserHeaders(cookie, {
              "content-type": "application/json",
              referer: `${ORIGIN}/thread/${threadId}`,
              "x-request-id": randomUUID()
            }),
            body: JSON.stringify(retryBody),
            signal: signal ?? void 0
          });
          if (!res2.ok) {
            const t2 = await res2.text().catch(() => "");
            return makeErrorResult(
              res2.status >= 400 && res2.status < 600 ? res2.status : 502,
              `HyperAgent chat HTTP ${res2.status}: ${t2.slice(0, 300)}`,
              body,
              retryUrl
            );
          }
          const parsed2 = await parseHyperAgentSseStream(res2);
          return await finalize(parsed2, messages, clientFacing, threadId, cookieKey, wantStream);
        }
        return makeErrorResult(
          res.status >= 400 && res.status < 600 ? res.status : 502,
          `HyperAgent chat HTTP ${res.status}: ${errText.slice(0, 300)}`,
          body,
          chatUrl
        );
      }
      const parsed = await parseHyperAgentSseStream(res);
      if (!parsed.sessionId && sessionId) parsed.sessionId = sessionId;
      return await finalize(parsed, messages, clientFacing, threadId, cookieKey, wantStream);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /cookie|401|unauthor/i.test(msg) ? 401 : /timeout/i.test(msg) ? 504 : 502;
      return makeErrorResult(status, `HyperAgent: ${msg}`, body, `${ORIGIN}/api/threads`);
    }
  }
}
async function finalize(parsed, messages, clientFacing, threadId, cookieKey, wantStream) {
  const text = (parsed.text || "").trim();
  if (!text) {
    return makeErrorResult(
      502,
      `HyperAgent returned empty content (events=${parsed.events})`,
      void 0,
      `${ORIGIN}/api/threads`
    );
  }
  await storeHyperAgentThreadAfterTurn(cookieKey, messages, text, threadId, parsed.sessionId || "");
  const modelOut = parsed.modelId || clientFacing;
  const response = wantStream ? pseudoStreamResponse(text, modelOut, threadId, parsed.sessionId) : chatCompletionResponse(text, modelOut, messages, threadId, parsed.sessionId);
  return {
    response,
    url: `${ORIGIN}/api/threads/${threadId}/chat`,
    headers: { Cookie: "***" },
    transformedBody: {
      threadId,
      sessionId: parsed.sessionId || null,
      model: modelOut
    }
  };
}
export {
  HYPERAGENT_FALLBACK_MODELS,
  ORIGIN as HYPERAGENT_ORIGIN,
  HyperAgentExecutor,
  buildHyperAgentChatBody,
  clearHyperAgentThreadBindingsForTests,
  configureHyperAgentThread,
  conversationFingerprint,
  cookieFingerprint,
  createHyperAgentThread,
  extractMessageText,
  extractThreadIdFromUrl,
  hasAssistantMessage,
  historyPrefixBeforeLastUser,
  lastAssistantFingerprint,
  normalizeForFingerprint,
  normalizeHyperAgentCookie,
  parseHyperAgentSseStream,
  readClientThreadIds,
  resolveHyperAgentCredentials,
  resolveHyperAgentThreadBinding,
  rootUserFingerprint,
  storeHyperAgentThreadAfterTurn
};
