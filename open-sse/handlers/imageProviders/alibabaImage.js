// Alibaba (DashScope) image generation — ported from OmniRoute
// imageGeneration/providers/alibabaImage.ts (handleAlibabaImageGeneration).
// POST region-resolved media baseUrl with OpenAI-style multimodal payload.
import { nowSec } from "./_base.js";
import { resolveAlibabaProviderMediaBaseUrl } from "../../utils/omni/alibabaProviderRegions.js";
import { isJsonObject } from "../../utils/omni/kieTask.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL =
  PROVIDER_MEDIA["alibaba"]?.imageConfig?.baseUrl ||
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

const DEFAULT_MODELS = [
  "qwen-image-3.0-pro",
  "qwen-image-2.0-pro-2026-06-22",
  "qwen-image-2.0",
  "wan2.7-image",
  "wan2.7-image-pro",
];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

function collectImageUrls(body) {
  const values = [body.image, body.image_url, body.imageUrls, body.image_urls].flatMap((value) =>
    Array.isArray(value) ? value : [value]
  );
  const urls = new Set();
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      urls.add(value.trim());
      continue;
    }
    if (!isJsonObject(value)) continue;
    const url =
      typeof value.url === "string"
        ? value.url
        : typeof value.image_url === "string"
          ? value.image_url
          : null;
    if (url?.trim()) urls.add(url.trim());
  }
  return [...urls];
}

function normalizeImageSize(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const size = value.trim();
  return /^\d+x\d+$/i.test(size) ? size.replace(/x/i, "*") : size;
}

function getAlibabaImageUrls(payload) {
  if (!isJsonObject(payload) || !isJsonObject(payload.output)) return [];
  const choices = Array.isArray(payload.output.choices) ? payload.output.choices : [];
  const urls = new Set();
  for (const choice of choices) {
    if (!isJsonObject(choice) || !isJsonObject(choice.message)) continue;
    const content = Array.isArray(choice.message.content) ? choice.message.content : [];
    for (const item of content) {
      if (!isJsonObject(item) || typeof item.image !== "string" || !item.image.trim()) continue;
      urls.add(item.image.trim());
    }
  }
  return [...urls];
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const token = credentials?.apiKey || credentials?.accessToken;
  if (!token) throw new Error("alibaba API key is required");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const content = [
    ...collectImageUrls(body).map((image) => ({ image })),
    ...(prompt ? [{ text: prompt }] : []),
  ];
  const parameters = isJsonObject(body.parameters) ? { ...body.parameters } : {};
  const size = normalizeImageSize(body.size);
  if (size) parameters.size = size;
  if (Number.isInteger(body.n) && Number(body.n) > 0) parameters.n = Number(body.n);
  for (const key of [
    "negative_prompt",
    "prompt_extend",
    "watermark",
    "seed",
    "enable_sequential",
    "thinking_mode",
    "color_palette",
  ]) {
    if (body[key] !== undefined) parameters[key] = body[key];
  }
  const mediaBaseUrl = resolveAlibabaProviderMediaBaseUrl("alibaba", credentials.providerSpecificData, BASE_URL);
  const url = mediaBaseUrl.endsWith("/services/aigc/multimodal-generation/generation")
    ? mediaBaseUrl
    : `${mediaBaseUrl}/services/aigc/multimodal-generation/generation`;
  log?.info?.("IMAGE", `alibaba/${model} (alibaba-image)`);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: { messages: [{ role: "user", content }] },
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      sanitizeErrorMessage(
        isJsonObject(payload)
          ? typeof payload.message === "string"
            ? payload.message
            : typeof payload.code === "string"
              ? payload.code
              : "Alibaba image generation failed"
          : "Alibaba image generation failed"
      )
    );
  }
  const urls = getAlibabaImageUrls(payload);
  if (urls.length === 0) throw new Error("Alibaba image generation returned no images");
  return { created: nowSec(), data: urls.map((url) => ({ url })) };
}

export default {
  buildUrl: (_model, creds) => {
    const mediaBaseUrl = resolveAlibabaProviderMediaBaseUrl("alibaba", creds?.providerSpecificData, BASE_URL);
    return mediaBaseUrl.endsWith("/services/aigc/multimodal-generation/generation")
      ? mediaBaseUrl
      : `${mediaBaseUrl}/services/aigc/multimodal-generation/generation`;
  },
  buildHeaders: (creds) => {
    const token = creds?.apiKey || creds?.accessToken;
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  },
  buildBody: (model, body) => {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const content = [
      ...collectImageUrls(body).map((image) => ({ image })),
      ...(prompt ? [{ text: prompt }] : []),
    ];
    const parameters = isJsonObject(body.parameters) ? { ...body.parameters } : {};
    const size = normalizeImageSize(body.size);
    if (size) parameters.size = size;
    if (Number.isInteger(body.n) && Number(body.n) > 0) parameters.n = Number(body.n);
    for (const key of [
      "negative_prompt",
      "prompt_extend",
      "watermark",
      "seed",
      "enable_sequential",
      "thinking_mode",
      "color_palette",
    ]) {
      if (body[key] !== undefined) parameters[key] = body[key];
    }
    return {
      model,
      input: { messages: [{ role: "user", content }] },
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    };
  },
  normalize: (responseBody) => {
    const urls = getAlibabaImageUrls(responseBody);
    return { created: nowSec(), data: urls.map((url) => ({ url })) };
  },
};
