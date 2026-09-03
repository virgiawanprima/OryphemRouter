import { BaseExecutor } from "./base.js";
import { buildErrorBody, sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { normalizeGeminiCookieInput } from "../utils/geminiCookies.js";
import { prepareToolMessages } from "../translator/webTools.js";
import { buildToolModeResponse } from "./chatgptWebTools.js";
import {
  checkGeminiWebUnsupportedControls,
  GEMINI_WEB_UNSUPPORTED_CONTROL_CODE
} from "./gemini-web/capabilities.js";
const GEMINI_URL = "https://gemini.google.com/app";
function isMissingBrowserExecutable(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("executable doesn't exist") || lower.includes("executablenotfound") || lower.includes("playwright install") || lower.includes("chromium") && lower.includes("download");
}
const GEMINI_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
function formatChatCompletion(content, model, finishReason = "stop") {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}
function formatStreamChunk(content, model, finishReason = null) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: finishReason }]
  };
}
function buildGeminiPrompt(messages) {
  const textMessages = messages.filter(
    (m) => typeof m.content === "string" && m.content.trim().length > 0
  );
  const userMessages = textMessages.filter((m) => m.role === "user");
  const lastUser = userMessages[userMessages.length - 1];
  const lastUserContent = lastUser?.content ?? "";
  const lastUserIdx = lastUser ? textMessages.lastIndexOf(lastUser) : -1;
  const priorTurns = textMessages.filter(
    (m, i) => i < lastUserIdx && (m.role === "user" || m.role === "assistant")
  );
  if (priorTurns.length === 0) return lastUserContent;
  const systemText = textMessages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const historyLines = priorTurns.map(
    (m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`
  );
  const parts = [];
  if (systemText) parts.push(`System:
${systemText}`);
  parts.push(`Previous conversation:
${historyLines.join("\n\n")}`);
  parts.push(`Current user message:
${lastUserContent}`);
  return parts.join("\n\n");
}
function buildGeminiToolPrompt(effectiveMessages) {
  const toolSystemMsg = effectiveMessages.find((m) => m.role === "system");
  const lastUserMsg = [...effectiveMessages].reverse().find((m) => m.role === "user");
  const userText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
  const toolPrompt = typeof toolSystemMsg?.content === "string" ? toolSystemMsg.content : "";
  return toolPrompt ? `${toolPrompt}

${userText}` : userText;
}
async function buildGeminiToolResponse(responseText, requestedTools, stream, model, cid, created) {
  const bufferedJson = new Response(JSON.stringify(formatChatCompletion(responseText, model)), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  return buildToolModeResponse(bufferedJson, requestedTools, stream, {
    cid,
    created,
    model,
    idSeed: "gwe"
  });
}
function parseCookies(raw) {
  return raw.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) return null;
    const name = part.substring(0, eqIdx).trim();
    const value = part.substring(eqIdx + 1).trim();
    if (!name || !value) return null;
    const lowerName = name.toLowerCase();
    if (["path", "domain", "expires", "max-age", "secure", "httponly", "samesite"].includes(
      lowerName
    )) {
      return null;
    }
    return { name, value };
  }).filter(Boolean);
}
function parseStreamResponse(raw) {
  const lines = raw.split("\n");
  let lastText = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === ")]}'" || /^\d+$/.test(line)) continue;
    if (!line.includes("wrb.fr")) continue;
    try {
      const arr = JSON.parse(line);
      if (!Array.isArray(arr) || !Array.isArray(arr[0]) || arr[0][0] !== "wrb.fr") continue;
      const payload = arr[0]?.[2];
      if (typeof payload !== "string") continue;
      const inner = JSON.parse(payload);
      const responseArray = inner?.[4]?.[0]?.[1];
      if (!Array.isArray(responseArray)) continue;
      const text = responseArray.filter((c) => typeof c === "string").join("");
      if (text) lastText = text;
    } catch {
    }
  }
  return lastText;
}
function parseStreamResponseImages(raw) {
  const urls = [];
  const seen = /* @__PURE__ */ new Set();
  const lines = raw.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === ")]}'" || /^\d+$/.test(line)) continue;
    if (!line.includes("wrb.fr")) continue;
    try {
      const arr = JSON.parse(line);
      if (!Array.isArray(arr) || !Array.isArray(arr[0]) || arr[0][0] !== "wrb.fr") continue;
      const payload = arr[0]?.[2];
      if (typeof payload !== "string") continue;
      const inner = JSON.parse(payload);
      const imageEntries = inner?.[4]?.[0]?.[12]?.[7]?.[0];
      if (!Array.isArray(imageEntries)) continue;
      for (const entry of imageEntries) {
        const urlField = entry?.[0]?.[3]?.[3];
        let url = "";
        if (typeof urlField === "string") {
          url = urlField;
        } else if (Array.isArray(urlField)) {
          const firstHttp = urlField.find(
            (u) => typeof u === "string" && /^https?:\/\//.test(u)
          );
          url = typeof firstHttp === "string" ? firstHttp : "";
        }
        if (!url || !/^https?:\/\//.test(url)) continue;
        if (!/=[swh]\d+/.test(url)) url += "=s2048";
        if (seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
      }
    } catch {
    }
  }
  return urls;
}
function readCredentialString(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}
function readProviderSpecificString(providerSpecificData, keys) {
  if (!providerSpecificData || typeof providerSpecificData !== "object" || Array.isArray(providerSpecificData)) {
    return "";
  }
  const data = providerSpecificData;
  for (const key of keys) {
    const value = readCredentialString(data[key]);
    if (value) return value;
  }
  return "";
}
function mergeRotatedGeminiCookies(originalCookie, jarCookies) {
  const ROTATABLE_NAMES = ["__Secure-1PSID", "__Secure-1PSIDTS", "__Secure-1PSIDCC"];
  const jarByName = new Map(jarCookies.map((c) => [c.name, c.value]));
  const pairs = parseCookies(originalCookie);
  const seen = /* @__PURE__ */ new Set();
  const merged = pairs.map(({ name, value }) => {
    seen.add(name);
    if (ROTATABLE_NAMES.includes(name) && jarByName.has(name)) {
      return { name, value: jarByName.get(name) };
    }
    return { name, value };
  });
  for (const name of ROTATABLE_NAMES) {
    if (!seen.has(name) && jarByName.has(name)) {
      merged.push({ name, value: jarByName.get(name) });
    }
  }
  return merged.map(({ name, value }) => `${name}=${value}`).join("; ");
}
function resolveGeminiWebCookie(credentials) {
  const directCookie = readCredentialString(credentials?.apiKey) || readCredentialString(credentials?.cookie);
  if (directCookie) return normalizeGeminiCookieInput(directCookie);
  const providerSpecificData = credentials?.providerSpecificData;
  const cookie = readProviderSpecificString(providerSpecificData, ["cookie"]);
  if (cookie) return normalizeGeminiCookieInput(cookie);
  const psid = readProviderSpecificString(providerSpecificData, ["__Secure-1PSID"]);
  const psidts = readProviderSpecificString(providerSpecificData, ["__Secure-1PSIDTS"]);
  return [
    psid ? normalizeGeminiCookieInput(psid, "__Secure-1PSID") : "",
    psidts ? normalizeGeminiCookieInput(psidts, "__Secure-1PSIDTS") : ""
  ].filter(Boolean).join("; ");
}
class GeminiWebExecutor extends BaseExecutor {
  constructor() {
    super("gemini-web", { id: "gemini-web", baseUrl: GEMINI_URL });
  }
  /**
   * testConnection — validates the cookie format without making a network call
   * or launching Playwright. Returns true when the cookie is non-empty and
   * contains at least one name=value pair with a non-empty value. This is a
   * lightweight pre-check before the browser automation path; full session
   * validation is done by validateGeminiWebProvider in the connection test
   * flow (#9407).
   */
  async testConnection(credentials, _signal) {
    try {
      const cookie = resolveGeminiWebCookie(credentials);
      if (!cookie) return false;
      const pairs = parseCookies(cookie);
      return pairs.some((p) => p.value.length > 0);
    } catch {
      return false;
    }
  }
  /**
   * Read the live Playwright cookie jar back after a successful run and, if
   * Google rotated any of the __Secure-1PSID* cookies, forward the merged
   * cookie string through onCredentialsRefreshed so it gets persisted to the
   * encrypted provider_connections.api_key field. Mirrors the rotate-and-
   * persist pattern already shipped in chatgpt-web.ts. A persistence failure
   * must never fail the user-facing response (#7676).
   */
  async persistRotatedCookies(context, cookie, credentials, onCredentialsRefreshed, log) {
    if (!onCredentialsRefreshed) return;
    try {
      const jarCookies = await context.cookies();
      const mergedCookie = mergeRotatedGeminiCookies(cookie, jarCookies);
      if (mergedCookie && mergedCookie !== cookie) {
        await onCredentialsRefreshed({ ...credentials, apiKey: mergedCookie });
      }
    } catch (err) {
      log?.warn?.(
        "GEMINI-WEB",
        `Failed to persist rotated cookie: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  async execute(input) {
    const { model, body, stream, credentials, signal, log, onCredentialsRefreshed } = input;
    const requestBody = body;
    const violation = checkGeminiWebUnsupportedControls(body);
    if (violation) {
      log?.warn?.(
        "GEMINI-WEB",
        `Rejected request: "${violation.param}" is not supported by this provider`
      );
      return {
        response: new Response(
          JSON.stringify(
            buildErrorBody(400, violation.message, null, {
              type: "invalid_request_error",
              code: GEMINI_WEB_UNSUPPORTED_CONTROL_CODE
            })
          ),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ),
        url: GEMINI_URL,
        headers: {},
        transformedBody: body
      };
    }
    const cookie = resolveGeminiWebCookie(credentials);
    if (!cookie) {
      return {
        response: new Response(JSON.stringify({ error: "Missing Gemini cookies" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }),
        url: GEMINI_URL,
        headers: {},
        transformedBody: body
      };
    }
    const messages = requestBody.messages || [];
    const { hasTools, requestedTools, effectiveMessages } = prepareToolMessages(
      body,
      messages
    );
    const prompt = hasTools ? buildGeminiToolPrompt(effectiveMessages) : buildGeminiPrompt(messages);
    if (!prompt) {
      return {
        response: new Response(JSON.stringify({ error: "No user message found" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }),
        url: GEMINI_URL,
        headers: {},
        transformedBody: body
      };
    }
    let browser = null;
    let abortBrowser = null;
    try {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error("Request aborted");
      }
      const { chromium } = await import("playwright");
      browser = await chromium.launch({ headless: true });
      abortBrowser = () => {
        void browser?.close().catch(() => {
        });
      };
      signal?.addEventListener("abort", abortBrowser, { once: true });
      const context = await browser.newContext({ userAgent: GEMINI_USER_AGENT });
      const cookiePairs = parseCookies(cookie);
      await context.addCookies(
        cookiePairs.map(({ name, value }) => ({
          name,
          value,
          domain: ".google.com",
          path: "/",
          secure: true
        }))
      );
      const page = await context.newPage();
      const imageMode = body?.x_gemini_web_image_mode === true;
      let responseText = "";
      const responseImages = [];
      let captured = false;
      const responsePromise = new Promise((resolve) => {
        page.on("response", async (resp) => {
          if (!resp.url().includes("StreamGenerate")) return;
          if (!imageMode && captured) return;
          if (imageMode) {
            try {
              const raw = await resp.text();
              const text = parseStreamResponse(raw);
              if (text) responseText = text;
              for (const url of parseStreamResponseImages(raw)) {
                if (!responseImages.includes(url)) responseImages.push(url);
              }
            } catch {
            }
            if (responseImages.length > 0) resolve();
          } else {
            captured = true;
            try {
              const raw = await resp.text();
              responseText = parseStreamResponse(raw);
            } catch {
            }
            resolve();
          }
        });
      });
      await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded", timeout: 2e4 });
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error("Request aborted");
      }
      await page.waitForTimeout(3e3);
      const inputEl = await page.waitForSelector(".ql-editor, [contenteditable='true']", {
        timeout: 1e4
      });
      await inputEl.click();
      await page.keyboard.type(prompt, { delay: 10 });
      await page.waitForTimeout(300);
      await page.keyboard.press("Enter");
      await Promise.race([responsePromise, page.waitForTimeout(imageMode ? 9e4 : 3e4)]);
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error("Request aborted");
      }
      if (imageMode) {
        await this.persistRotatedCookies(context, cookie, credentials, onCredentialsRefreshed, log);
        const modelId2 = model || "gemini-2.5-pro";
        return {
          response: new Response(
            JSON.stringify({
              ...formatChatCompletion(responseText, modelId2),
              x_gemini_web_image_urls: responseImages
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          ),
          url: GEMINI_URL,
          headers: {},
          transformedBody: body
        };
      }
      if (!responseText) {
        return {
          response: new Response(JSON.stringify({ error: "No response from Gemini" }), {
            status: 502,
            headers: { "Content-Type": "application/json" }
          }),
          url: GEMINI_URL,
          headers: {},
          transformedBody: body
        };
      }
      await this.persistRotatedCookies(context, cookie, credentials, onCredentialsRefreshed, log);
      const modelId = model || "gemini-2.5-pro";
      if (hasTools) {
        const cid = `chatcmpl-gwe-${crypto.randomUUID().slice(0, 12)}`;
        const created = Math.floor(Date.now() / 1e3);
        const toolResponse = await buildGeminiToolResponse(
          responseText,
          requestedTools,
          Boolean(stream),
          modelId,
          cid,
          created
        );
        return { response: toolResponse, url: GEMINI_URL, headers: {}, transformedBody: body };
      }
      if (stream) {
        const encoder = new TextEncoder();
        const readable = new ReadableStream(
          {
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify(formatStreamChunk(responseText, modelId))}

`
                )
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify(formatStreamChunk("", modelId, "stop"))}

`
                )
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          },
          { highWaterMark: 16384 }
        );
        return {
          response: new Response(readable, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive"
            }
          }),
          url: GEMINI_URL,
          headers: {},
          transformedBody: body
        };
      }
      return {
        response: new Response(JSON.stringify(formatChatCompletion(responseText, modelId)), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }),
        url: GEMINI_URL,
        headers: {},
        transformedBody: body
      };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unknown error";
      if (isMissingBrowserExecutable(rawMessage)) {
        return {
          response: new Response(
            JSON.stringify({
              error: "Gemini Web requires the Playwright Chromium browser, which is not installed. Run `npx playwright install chromium` on the host (or rebuild the Docker image with browsers)."
            }),
            {
              status: 503,
              headers: {
                "Content-Type": "application/json",
                "X-Omni-Fallback-Hint": "connection_cooldown"
              }
            }
          ),
          url: GEMINI_URL,
          headers: {},
          transformedBody: body
        };
      }
      if (error instanceof Error && (error.name === "TimeoutError" || rawMessage.includes("waitForSelector") || rawMessage.includes("Timeout") || rawMessage.includes("actionability") || rawMessage.includes("interception"))) {
        return {
          response: new Response(
            JSON.stringify({
              error: sanitizeErrorMessage(rawMessage)
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          ),
          url: GEMINI_URL,
          headers: {},
          transformedBody: body
        };
      }
      return {
        response: new Response(
          JSON.stringify({
            error: sanitizeErrorMessage(rawMessage)
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        ),
        url: GEMINI_URL,
        headers: {},
        transformedBody: body
      };
    } finally {
      if (abortBrowser) signal?.removeEventListener("abort", abortBrowser);
      if (browser) {
        try {
          await browser.close();
        } catch {
        }
      }
    }
  }
}
export {
  GeminiWebExecutor,
  buildGeminiPrompt,
  buildGeminiToolPrompt,
  buildGeminiToolResponse,
  isMissingBrowserExecutable,
  mergeRotatedGeminiCookies,
  parseStreamResponse,
  parseStreamResponseImages
};
