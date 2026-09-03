import { BaseExecutor } from "./base.js";
import { mergeAbortSignals, mergeUpstreamExtraHeaders } from "./executorUtils.js";
import { FETCH_TIMEOUT_MS } from "./executorConstants.js";
import { buildErrorBody } from "../utils/errorSanitize.js";
import { stripCookieInputPrefix } from "../utils/webCookieAuth.js";
const AISTUDIO_BASE = "https://aistudio.tencent.ai";
const MODEL_MAP = {
  "hy3-g": "HunyuanDefault",
  "hunyuan-default": "HunyuanDefault",
  "hunyuan-3d": "Hunyuan3D"
};
class TencentAIStudioWebExecutor extends BaseExecutor {
  constructor() {
    super("tencent-aistudio-web", { id: "tencent-aistudio-web", baseUrl: AISTUDIO_BASE });
  }
  async execute(input) {
    const { model, body, credentials, signal } = input;
    const targetModelId = model || "hy3-g";
    const chatUrl = `${AISTUDIO_BASE}/api/chat/${MODEL_MAP[targetModelId] || "HunyuanDefault"}`;
    let cookie = credentials.apiKey || "";
    if (!cookie) {
      return {
        response: new Response(
          JSON.stringify(
            buildErrorBody(
              401,
              "Tencent AI Studio Cookie is required. Log in to aistudio.tencent.ai and paste your Cookie header.",
              null,
              { type: "invalid_request_error", code: "missing_cookie" }
            )
          ),
          { status: 401, headers: { "Content-Type": "application/json" } }
        ),
        url: chatUrl,
        headers: {},
        transformedBody: body
      };
    }
    cookie = stripCookieInputPrefix(cookie);
    const targetModel = MODEL_MAP[targetModelId] || "HunyuanDefault";
    const chatBody = body;
    const messages = chatBody.messages || [];
    const headers = {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: AISTUDIO_BASE,
      Referer: `${AISTUDIO_BASE}/`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    mergeUpstreamExtraHeaders(headers, input.upstreamExtraHeaders);
    const upstreamBody = JSON.stringify({ model: targetModel, messages });
    const controller = new AbortController();
    const primary = signal ?? new AbortController().signal;
    const mergedSignal = mergeAbortSignals(primary, controller.signal);
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let upstream;
    try {
      upstream = await fetch(chatUrl, {
        method: "POST",
        headers,
        body: upstreamBody,
        signal: mergedSignal
      });
    } finally {
      clearTimeout(timeout);
    }
    return {
      response: new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      }),
      url: chatUrl,
      headers,
      transformedBody: upstreamBody
    };
  }
}
const tencentAIStudioWebExecutor = new TencentAIStudioWebExecutor();
var tencent_aistudio_web_default = tencentAIStudioWebExecutor;
export {
  TencentAIStudioWebExecutor,
  tencent_aistudio_web_default as default
};
