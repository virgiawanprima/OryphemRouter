// Segmind image generation — ported from OmniRoute
// imageGeneration/providers/segmind.ts (handleSegmindImageGeneration).
// Uses the shared segmindClient (open-sse/utils/segmindClient.js): POST
// {baseUrl}/{model} with x-api-key, returns raw image bytes.
import { nowSec } from "./_base.js";
import { isSegmindFailure, segmindRequest } from "../../utils/segmindClient.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["segmind"]?.imageConfig?.baseUrl || "https://api.segmind.com/v1";

const DEFAULT_MODELS = [
  "flux-schnell",
  "flux-dev",
  "flux-1.1-pro",
  "sdxl1.0-txt2img",
  "sd3.5-large-txt2img",
  "kandinsky2.2-txt2img",
];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

function parseSegmindSize(size) {
  if (typeof size === "string" && size.includes("x")) {
    const [w, h] = size.split("x").map(Number);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
  }
  return { width: 1024, height: 1024 };
}

function buildSegmindImageBody(body, prompt) {
  const { width, height } = parseSegmindSize(body.size);
  const upstreamBody = { prompt, width, height, samples: Number(body.n) > 0 ? Number(body.n) : 1 };
  if (typeof body.negative_prompt === "string") upstreamBody.negative_prompt = body.negative_prompt;
  if (typeof body.seed === "number") upstreamBody.seed = body.seed;
  return upstreamBody;
}

function formatSegmindImage(buffer, contentType, prompt, wantsB64) {
  const base64 = buffer.toString("base64");
  if (wantsB64) return { b64_json: base64, revised_prompt: prompt };
  const mimeType = contentType.startsWith("image/") ? contentType : "image/jpeg";
  return { url: `data:${mimeType};base64,${base64}`, revised_prompt: prompt };
}

export async function generateImage({ model, body, credentials, log }) {
  const token = credentials?.apiKey || credentials?.accessToken || "";
  const prompt = typeof body.prompt === "string" ? body.prompt : String(body.prompt ?? "");
  const upstreamBody = buildSegmindImageBody(body, prompt);
  log?.info?.("IMAGE", `segmind/${model} (segmind) | prompt: "${prompt.slice(0, 60)}..."`);
  const result = await segmindRequest({
    baseUrl: BASE_URL,
    model,
    token,
    upstreamBody,
    callLogPath: "/v1/images/generations",
    provider: "segmind",
    scope: "IMAGE",
    log,
  });
  if (isSegmindFailure(result)) throw new Error(result.error || "Segmind generation failed");
  return {
    created: nowSec(),
    data: [formatSegmindImage(result.buffer, result.contentType, prompt, body.response_format === "b64_json")],
  };
}

export default {
  buildUrl: (model) => `${BASE_URL.replace(/\/$/, "")}/${model}`,
  buildHeaders: (creds) => {
    const token = creds?.apiKey || creds?.accessToken || "";
    return { "Content-Type": "application/json", "x-api-key": token };
  },
  buildBody: (_model, body) => buildSegmindImageBody(body, body.prompt),
  // Segmind returns raw image bytes — convert to b64_json
  async parseResponse(response, { body }) {
    const contentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      created: nowSec(),
      data: [formatSegmindImage(buffer, contentType, body.prompt, body.response_format === "b64_json")],
    };
  },
  normalize: (responseBody) => responseBody,
};
