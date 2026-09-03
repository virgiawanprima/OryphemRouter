// ChatGPT Web image generation — ported from OmniRoute
// imageGeneration/providers/chatgptWeb.ts (handleChatGptWebImageGeneration).
// Each image is one chatgpt.com chat turn; uses the ported ChatGptWebExecutor
// and chatgptImageCache to resolve /v1/chatgpt-web/image/{id} bytes.
import { nowSec } from "./_base.js";
import { ChatGptWebExecutor } from "../../executors/chatgpt-web.js";
import { getChatGptImage } from "../../services/chatgptImageCache.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["chatgpt-web"]?.imageConfig?.baseUrl || "https://chatgpt.com/backend-api/f/conversation";

const DEFAULT_MODELS = ["gpt-5.5", "gpt-5.5-pro", "gpt-5.5-high", "gpt-5.5-medium", "gpt-5.5-instant"];

export const CHATGPT_WEB_IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g;
export const CHATGPT_WEB_IMAGE_ID_RE = /\/v1\/chatgpt-web\/image\/([a-f0-9]{16,64})(?=[?\s"'<>)]|$)/i;

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

export function extractMarkdownImageUrls(text) {
  const urls = [];
  for (const match of text.matchAll(CHATGPT_WEB_IMAGE_MARKDOWN_RE)) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

export function buildChatGptWebImagePrompt(body) {
  const prompt = String(body.prompt || "").trim();
  const details = [`Create an image for this prompt: ${prompt}`];
  if (typeof body.size === "string" && body.size.trim()) {
    details.push(`Requested size: ${body.size.trim()}.`);
  }
  if (typeof body.quality === "string" && body.quality.trim()) {
    details.push(`Requested quality: ${body.quality.trim()}.`);
  }
  if (typeof body.style === "string" && body.style.trim()) {
    details.push(`Requested style: ${body.style.trim()}.`);
  }
  return details.join("\n");
}

export async function generateImage({ model, body, credentials, log, signal, clientHeaders, executorFactory }) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new Error("Prompt is required for ChatGPT Web image generation");
  if (!credentials?.apiKey) throw new Error("ChatGPT Web credentials missing session cookie");

  const CHATGPT_WEB_IMAGE_N_MAX = 4;
  const rawCount = Number.isInteger(body.n) && body.n > 0 ? body.n : 1;
  if (rawCount > CHATGPT_WEB_IMAGE_N_MAX) {
    throw new Error(`ChatGPT Web image generation supports n=1..${CHATGPT_WEB_IMAGE_N_MAX} (got ${rawCount}); each n is a separate ~30s chat turn.`);
  }
  const requestedCount = rawCount;
  const wantsBase64 = body.response_format === "b64_json";
  const images = [];

  for (let i = 0; i < requestedCount; i++) {
    const executor = executorFactory ? executorFactory() : new ChatGptWebExecutor();
    const result = await executor.execute({
      model,
      body: { messages: [{ role: "user", content: buildChatGptWebImagePrompt(body) }] },
      stream: false,
      credentials,
      signal,
      log,
      clientHeaders,
    });

    const responseText = await result.response.text();
    if (result.response.status >= 400) {
      throw new Error(responseText || `ChatGPT Web error ${result.response.status}`);
    }

    let content = "";
    let imageResolutionFailed = false;
    try {
      const json = JSON.parse(responseText);
      content = String(json?.choices?.[0]?.message?.content || "");
      imageResolutionFailed = json?.x_image_resolution_failed === true;
    } catch {
      content = responseText;
    }

    const urls = extractMarkdownImageUrls(content);
    if (urls.length === 0) {
      const error = imageResolutionFailed
        ? "ChatGPT Web generated an image but the image asset could not be downloaded (the URL may have expired). Please retry."
        : `ChatGPT Web completed without returning image markdown: ${content.slice(0, 300)}`;
      throw new Error(error);
    }

    for (const url of urls) {
      if (!wantsBase64) {
        images.push({ url });
        continue;
      }
      const id = url.match(CHATGPT_WEB_IMAGE_ID_RE)?.[1];
      const cached = id ? getChatGptImage(id) : null;
      if (!cached) throw new Error("ChatGPT Web image bytes expired before b64_json conversion");
      images.push({ b64_json: cached.bytes.toString("base64") });
    }
  }
  return { created: nowSec(), data: images };
}

export default {
  useExecutor: true,
  buildUrl: () => BASE_URL,
  buildHeaders: () => ({}),
  buildBody: () => ({}),
  async executeViaExecutor(model, body, credentials, log) {
    return generateImage({ model, body, credentials, log });
  },
  normalize: (responseBody) => responseBody,
  generateImage,
  supportsModel,
  getModels,
};
