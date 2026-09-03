import { createHash, randomUUID } from "node:crypto";
import { BaseExecutor } from "./base.js";
import { configureZaiBrowserRequest } from "./zai-web/browserAutomation.js";
import {
  asRecord,
  browserModelName,
  browserPrompt,
  buildZaiCompletionUrl,
  buildZaiHeaders,
  buildZaiNewChatBody,
  buildZaiRequestBody,
  buildZaiSignature,
  collectZaiImageUrls,
  describeZaiBrowserFailure,
  extractZaiToken,
  extractZaiUserId,
  foldMessages,
  getZaiModelCapabilities,
  latestUserPrompt,
  parseZaiFrontendVersion,
  resolveZaiCaptchaVerifyParam,
  resolveZaiThinkingConfig,
  resolveZaiVlmConfig,
  unprefixedModelId,
  zaiImageFileName,
  ZAI_BASE_URL,
  ZAI_CHAT_URL,
  ZAI_DEFAULT_FE_VERSION,
  ZAI_DEFAULT_MODEL,
  ZAI_FE_VERSION_CACHE_TTL_MS,
  ZAI_NEW_CHAT_URL,
  ZAI_USER_AGENT
} from "./zai-web/protocol.js";
import {
  buildZaiStreamingBody,
  collectZaiNonStreaming,
  makeZaiChunkEmitter
} from "./zai-web/stream.js";
import { browserBackedChat } from "../services/browserBackedChat.js";
import { CursorImageError, resolveCursorImages } from "../utils/cursorImages.js";
import {
  makeExecutorErrorResult as makeErrorResult,
  sanitizeErrorMessage
} from "../utils/errorSanitize.js";
import {
  buildZaiSignature as buildZaiSignature2,
  describeZaiBrowserFailure as describeZaiBrowserFailure2,
  extractZaiCaptchaVerifyParam,
  extractZaiToken as extractZaiToken2,
  extractZaiUserId as extractZaiUserId2,
  foldMessages as foldMessages2,
  getZaiModelCapabilities as getZaiModelCapabilities2,
  parseZaiFrontendVersion as parseZaiFrontendVersion2,
  resolveZaiThinkingConfig as resolveZaiThinkingConfig2,
  resolveZaiVlmConfig as resolveZaiVlmConfig2
} from "./zai-web/protocol.js";
import { parseZaiFrame } from "./zai-web/stream.js";
let cachedFeVersion = null;
async function resolveZaiBrowserAttachments(imageUrls, body) {
  try {
    const images = await resolveCursorImages(imageUrls, { prepareForWire: false });
    return {
      attachments: images.map((image, index) => {
        const mimeType = image.mimeType ?? "image/jpeg";
        return {
          name: zaiImageFileName(mimeType, index),
          mimeType,
          buffer: image.data
        };
      })
    };
  } catch (error) {
    const message = error instanceof CursorImageError ? error.message : sanitizeErrorMessage(error instanceof Error ? error.message : "invalid image input");
    return {
      errorResult: makeErrorResult(
        error instanceof CursorImageError ? error.status : 400,
        `Z.ai image input error: ${message}`,
        body,
        ZAI_CHAT_URL
      )
    };
  }
}
function buildZaiBrowserAuditBody(input) {
  const { thinkingConfig: thinking, vlmConfig: vlm } = input;
  return {
    browser_backed: true,
    image_count: input.imageCount,
    model: input.modelId,
    messages: foldMessages(input.messages),
    enable_thinking: thinking.enabled,
    auto_web_search: vlm.websiteModeEnabled ? false : vlm.webSearchEnabled,
    vlm_tools_enable: vlm.toolsEnabled,
    vlm_web_search_enable: vlm.websiteModeEnabled && vlm.webSearchEnabled,
    vlm_website_mode: vlm.websiteModeEnabled,
    ...thinking.enabled && thinking.effortSupported ? { reasoning_effort: thinking.effort } : {}
  };
}
function buildZaiBrowserChatOptions(input) {
  const poolKey = `zai-web:${createHash("sha256").update(input.token).digest("hex").slice(0, 24)}`;
  return {
    poolKey,
    chatUrl: ZAI_CHAT_URL,
    chatPageUrl: `${ZAI_BASE_URL}/?model=${encodeURIComponent(browserModelName(input.modelId))}`,
    userMessage: browserPrompt(input.messages),
    localStorage: { token: input.token },
    localStorageOrigin: ZAI_BASE_URL,
    cookieDomain: "chat.z.ai",
    chatUrlMatchDomain: "chat.z.ai",
    userAgent: ZAI_USER_AGENT,
    locale: "en-US",
    timezone: "Asia/Seoul",
    inputSelector: "#chat-input",
    submitButtonSelector: '[aria-label="Send Message"] button:not([disabled])',
    submitButtonMode: "dom",
    attachments: input.attachments,
    beforeSubmit: (page) => configureZaiBrowserRequest(page, {
      modelId: input.modelId,
      thinking: input.thinkingConfig,
      vlm: input.vlmConfig
    }),
    postSubmitWaitMs: 3e4,
    signal: input.signal,
    reuseContext: true
  };
}
function resolveZaiRequest(input) {
  const { body, credentials, model } = input;
  const bodyObj = body || {};
  const fail = (message) => ({
    errorResult: makeErrorResult(400, message, body, ZAI_CHAT_URL)
  });
  const rawCredential = String(credentials?.apiKey ?? credentials?.accessToken ?? "").trim();
  const token = extractZaiToken(rawCredential);
  if (!token) {
    return fail(
      'Missing Z.ai web-session credential \u2014 copy the "token" value from chat.z.ai Local Storage.'
    );
  }
  const messages = bodyObj.messages || [];
  const prompt = latestUserPrompt(messages);
  const imageUrls = collectZaiImageUrls(messages);
  if (!prompt && imageUrls.length === 0) {
    return fail("Z.ai requires at least one user message");
  }
  const modelId = bodyObj.model || model || ZAI_DEFAULT_MODEL;
  if (imageUrls.length > 0 && !getZaiModelCapabilities(modelId).vision) {
    return fail(
      `Z.ai model ${unprefixedModelId(modelId)} does not accept image input; use GLM-5V-Turbo.`
    );
  }
  const userId = extractZaiUserId(token);
  if (!userId) {
    return fail(
      "Invalid Z.ai web-session credential \u2014 its JWT payload does not contain the required user id."
    );
  }
  return {
    request: {
      captchaVerifyParam: resolveZaiCaptchaVerifyParam(credentials, bodyObj),
      imageUrls,
      messages,
      modelId,
      prompt,
      thinkingConfig: resolveZaiThinkingConfig(modelId, bodyObj),
      token,
      userId,
      vlmConfig: resolveZaiVlmConfig(modelId, bodyObj)
    }
  };
}
class ZaiWebExecutor extends BaseExecutor {
  constructor() {
    super("zai-web", { id: "zai-web", baseUrl: ZAI_BASE_URL });
  }
  async resolveFrontendVersion(signal) {
    if (cachedFeVersion && cachedFeVersion.expiresAt > Date.now()) {
      return cachedFeVersion.value;
    }
    let version = ZAI_DEFAULT_FE_VERSION;
    try {
      const response = await fetch(`${ZAI_BASE_URL}/`, {
        headers: { Accept: "text/html", "User-Agent": ZAI_USER_AGENT },
        signal
      });
      if (response.ok) {
        version = parseZaiFrontendVersion(await response.text()) ?? version;
      }
    } catch {
    }
    cachedFeVersion = {
      value: version,
      expiresAt: Date.now() + ZAI_FE_VERSION_CACHE_TTL_MS
    };
    return version;
  }
  async createRemoteChat(input) {
    const { userMessageId, payload } = buildZaiNewChatBody(
      input.messages,
      input.modelId,
      input.enableThinking,
      input.reasoningEffort,
      input.vlmConfig
    );
    let response;
    try {
      response = await fetch(ZAI_NEW_CHAT_URL, {
        method: "POST",
        headers: buildZaiHeaders(input.token, {
          accept: "application/json"
        }),
        body: JSON.stringify(payload),
        signal: input.signal
      });
    } catch (error) {
      const message = sanitizeErrorMessage(
        error instanceof Error ? error.message : "unknown network error"
      );
      return {
        errorResult: makeErrorResult(
          502,
          `Z.ai chat creation failed: ${message}`,
          input.originalBody,
          ZAI_NEW_CHAT_URL
        )
      };
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        errorResult: makeErrorResult(
          response.status,
          `Z.ai chat creation error: ${sanitizeErrorMessage(errorText)}`,
          input.originalBody,
          ZAI_NEW_CHAT_URL
        )
      };
    }
    const result = asRecord(await response.json().catch(() => null));
    const chatId = typeof result?.id === "string" ? result.id : "";
    if (!chatId) {
      return {
        errorResult: makeErrorResult(
          502,
          "Z.ai chat creation returned no chat id",
          input.originalBody,
          ZAI_NEW_CHAT_URL
        )
      };
    }
    return { chatId, userMessageId };
  }
  async fetchUpstream(completionUrl, reqHeaders, reqBody, body, signal) {
    let upstream;
    try {
      upstream = await fetch(completionUrl, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(reqBody),
        signal
      });
    } catch (error) {
      const message = sanitizeErrorMessage(
        error instanceof Error ? error.message : "unknown network error"
      );
      return {
        errorResult: makeErrorResult(502, `Z.ai fetch failed: ${message}`, body, ZAI_CHAT_URL)
      };
    }
    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => "");
      return {
        errorResult: makeErrorResult(
          upstream.status,
          `Z.ai error: ${sanitizeErrorMessage(errorText)}`,
          body,
          ZAI_CHAT_URL
        )
      };
    }
    return { upstream };
  }
  async fetchThroughBrowser(input) {
    const resolved = await resolveZaiBrowserAttachments(input.imageUrls, input.body);
    if ("errorResult" in resolved) return resolved;
    const { attachments } = resolved;
    let result;
    try {
      result = await browserBackedChat(buildZaiBrowserChatOptions({ ...input, attachments }));
    } catch (error) {
      const message = sanitizeErrorMessage(
        error instanceof Error ? error.message : "browser transport unavailable"
      );
      return {
        errorResult: makeErrorResult(
          502,
          `Z.ai browser transport failed: ${message}`,
          input.body,
          ZAI_CHAT_URL
        )
      };
    }
    if (result.status < 200 || result.status >= 300) {
      return {
        errorResult: makeErrorResult(
          result.status || 502,
          describeZaiBrowserFailure(result),
          input.body,
          ZAI_CHAT_URL
        )
      };
    }
    return {
      upstream: new Response(new Uint8Array(result.body), {
        status: result.status,
        headers: {
          "Content-Type": result.contentType || "text/event-stream"
        }
      }),
      auditHeaders: {
        Authorization: "Bearer [REDACTED]",
        "X-OmniRoute-Transport": "browser"
      },
      auditBody: buildZaiBrowserAuditBody({
        messages: input.messages,
        modelId: input.modelId,
        thinkingConfig: input.thinkingConfig,
        vlmConfig: input.vlmConfig,
        imageCount: attachments.length
      })
    };
  }
  /**
   * Signed-API transport: create a chat server-side, then POST the completion with
   * a CAPTCHA proof and a per-request signature. Only reachable when the caller
   * supplied a proof and sent no images.
   */
  async fetchViaSignedApi(request, input) {
    const { body, signal } = input;
    const bodyObj = body || {};
    const { messages, modelId, prompt, thinkingConfig, token, userId, vlmConfig } = request;
    const frontendVersion = await this.resolveFrontendVersion(signal);
    const createdChat = await this.createRemoteChat({
      messages,
      modelId,
      token,
      enableThinking: thinkingConfig.enabled,
      reasoningEffort: thinkingConfig.effort,
      vlmConfig,
      signal,
      originalBody: body
    });
    if ("errorResult" in createdChat) return createdChat;
    const timestamp = Date.now();
    const requestId = randomUUID();
    const signature = buildZaiSignature({ prompt, requestId, timestamp, userId });
    const completionUrl = buildZaiCompletionUrl({ requestId, timestamp, token, userId });
    const reqHeaders = buildZaiHeaders(token, {
      accept: "text/event-stream",
      frontendVersion,
      signature
    });
    const reqBody = buildZaiRequestBody({
      body: bodyObj,
      captchaVerifyParam: request.captchaVerifyParam,
      chatId: createdChat.chatId,
      messages,
      modelId,
      prompt,
      userMessageId: createdChat.userMessageId,
      enableThinking: thinkingConfig.enabled,
      reasoningEffort: thinkingConfig.effort,
      reasoningEffortSupported: thinkingConfig.effortSupported,
      vlmConfig
    });
    const fetched = await this.fetchUpstream(completionUrl, reqHeaders, reqBody, body, signal);
    if ("errorResult" in fetched) return fetched;
    return {
      upstream: fetched.upstream,
      auditHeaders: {
        ...reqHeaders,
        Authorization: "Bearer [REDACTED]",
        "X-Signature": "[REDACTED]"
      },
      auditBody: { ...reqBody, captcha_verify_param: "[REDACTED]" }
    };
  }
  async execute(input) {
    const { body, signal, stream: wantStream } = input;
    const resolved = resolveZaiRequest(input);
    if ("errorResult" in resolved) return resolved.errorResult;
    const request = resolved.request;
    const { imageUrls, messages, modelId, thinkingConfig, token, vlmConfig } = request;
    const useSignedApi = Boolean(request.captchaVerifyParam) && imageUrls.length === 0;
    const fetched = useSignedApi ? await this.fetchViaSignedApi(request, input) : await this.fetchThroughBrowser({
      body,
      imageUrls,
      messages,
      modelId,
      signal,
      thinkingConfig,
      token,
      vlmConfig
    });
    if ("errorResult" in fetched) return fetched.errorResult;
    const { upstream, auditHeaders, auditBody } = fetched;
    const id = `chatcmpl-zai-${Date.now()}`;
    const created = Math.floor(Date.now() / 1e3);
    const sourceBody = upstream.body ?? new ReadableStream({ start: (controller) => controller.close() });
    const emitChunk = makeZaiChunkEmitter(id, created, modelId);
    if (wantStream) {
      const outStream = buildZaiStreamingBody(sourceBody, emitChunk, signal);
      return {
        response: new Response(outStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive"
          }
        }),
        url: ZAI_CHAT_URL,
        headers: auditHeaders,
        transformedBody: auditBody
      };
    }
    let answer;
    let reasoning;
    try {
      ({ answer, reasoning } = await collectZaiNonStreaming(sourceBody));
    } catch (error) {
      const message2 = sanitizeErrorMessage(
        error instanceof Error ? error.message : "invalid upstream stream"
      );
      return makeErrorResult(502, `Z.ai stream failed: ${message2}`, body, ZAI_CHAT_URL);
    }
    const message = { role: "assistant", content: answer };
    if (reasoning) message.reasoning_content = reasoning;
    const completion = {
      id,
      object: "chat.completion",
      created,
      model: modelId,
      choices: [{ index: 0, message, finish_reason: "stop" }]
    };
    return {
      response: new Response(JSON.stringify(completion), {
        headers: { "Content-Type": "application/json" }
      }),
      url: ZAI_CHAT_URL,
      headers: auditHeaders,
      transformedBody: auditBody
    };
  }
}
export {
  ZaiWebExecutor,
  buildZaiSignature2 as buildZaiSignature,
  describeZaiBrowserFailure2 as describeZaiBrowserFailure,
  extractZaiCaptchaVerifyParam,
  extractZaiToken2 as extractZaiToken,
  extractZaiUserId2 as extractZaiUserId,
  foldMessages2 as foldMessages,
  getZaiModelCapabilities2 as getZaiModelCapabilities,
  parseZaiFrame,
  parseZaiFrontendVersion2 as parseZaiFrontendVersion,
  resolveZaiThinkingConfig2 as resolveZaiThinkingConfig,
  resolveZaiVlmConfig2 as resolveZaiVlmConfig
};
