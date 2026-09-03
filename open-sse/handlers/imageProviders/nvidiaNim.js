// NVIDIA NIM image generation (FLUX models) — ported from OmniRoute
// imageGeneration/providers/nvidiaNim.ts (handleNvidiaNimImageGeneration).
// POST {baseUrl}/{model} with a native per-model NIM body; response shape
// varies (artifacts[].base64, images[], data[].b64_json, ...) — normalized
// by normalizeNvidiaNimImages().
import { nowSec } from "./_base.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["nvidia"]?.imageConfig?.baseUrl || "https://ai.api.nvidia.com/v1/genai";

const DEFAULT_MODELS = [
  "black-forest-labs/flux.1-dev",
  "black-forest-labs/flux.1-schnell",
  "black-forest-labs/flux.1-kontext-dev",
  "black-forest-labs/flux.2-klein-4b",
];

const FLUX_1_DEV = "black-forest-labs/flux.1-dev";
const FLUX_1_KONTEXT_DEV = "black-forest-labs/flux.1-kontext-dev";

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

function numberFromInput(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseSizeString(size) {
  if (typeof size !== "string" || !size || size === "auto") return null;
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseDimensions(body) {
  const width = numberFromInput(body.width);
  const height = numberFromInput(body.height);
  if (width !== null && height !== null) return { width, height };
  return parseSizeString(body.size);
}

function copyIfPresent(target, source, key) {
  if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
    target[key] = source[key];
  }
}

function copyNumberIfPresent(target, source, key, options = {}) {
  if (source[key] === undefined || source[key] === null || source[key] === "") return;
  const value = Number(source[key]);
  if (!Number.isFinite(value)) return;
  if (options.greaterThan !== undefined && !(value > options.greaterThan)) return;
  target[key] = value;
}

function normalizeImageArray(image) {
  if (Array.isArray(image)) return image.filter(Boolean);
  return image ? [image] : [];
}

function isFlux1DevDimension(value) {
  return Number.isInteger(value) && value >= 768 && value <= 1344 && value % 64 === 0;
}

export function buildNvidiaNimRequestBody(model, body) {
  const req = { prompt: body.prompt };
  const dimensions = parseDimensions(body);
  if (dimensions && model !== FLUX_1_KONTEXT_DEV) {
    if (model !== FLUX_1_DEV || (isFlux1DevDimension(dimensions.width) && isFlux1DevDimension(dimensions.height))) {
      req.width = dimensions.width;
      req.height = dimensions.height;
    }
  }
  if (model === FLUX_1_DEV) {
    const mode = body.mode || "base";
    req.mode = mode;
    if (mode !== "base") {
      const images = normalizeImageArray(body.image);
      if (images.length > 0) req.image = images[0];
    }
  } else if (model === FLUX_1_KONTEXT_DEV) {
    const images = normalizeImageArray(body.image);
    if (images.length > 0) req.image = images[0];
    copyIfPresent(req, body, "aspect_ratio");
  } else if (body.image) {
    req.image = normalizeImageArray(body.image);
  }
  if (model === FLUX_1_DEV) {
    copyNumberIfPresent(req, body, "cfg_scale", { greaterThan: 1 });
  } else {
    copyIfPresent(req, body, "cfg_scale");
  }
  copyIfPresent(req, body, "seed");
  copyIfPresent(req, body, "steps");
  return req;
}

function imageItemFromValue(value) {
  if (!value) return null;
  if (typeof value === "string") return { b64_json: value };
  if (typeof value !== "object") return null;
  const obj = value;
  if (typeof obj.url === "string") return { url: obj.url };
  const base64 = obj.base64 || obj.b64_json || obj.image || obj.data;
  if (typeof base64 !== "string") return null;
  const item = { b64_json: base64 };
  const finishReason = obj.finishReason || obj.finish_reason;
  if (typeof finishReason === "string") item.finish_reason = finishReason;
  return item;
}

export function normalizeNvidiaNimImages(responseBody) {
  const obj = responseBody && typeof responseBody === "object" ? responseBody : {};
  if (typeof obj.created === "number" && Array.isArray(obj.data)) return obj;
  const candidates = [];
  if (Array.isArray(obj.artifacts)) candidates.push(...obj.artifacts);
  if (Array.isArray(obj.images)) candidates.push(...obj.images);
  if (Array.isArray(obj.data)) candidates.push(...obj.data);
  if (obj.artifact) candidates.push(obj.artifact);
  if (obj.image) candidates.push(obj.image);
  if (obj.base64) candidates.push(obj.base64);
  const result = obj.result;
  if (result?.image) candidates.push(result.image);
  if (result && Array.isArray(result.artifacts)) candidates.push(...result.artifacts);
  return {
    created: nowSec(),
    data: candidates.map(imageItemFromValue).filter((item) => item !== null),
  };
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const token = credentials?.apiKey || credentials?.accessToken || "";
  if (model === FLUX_1_KONTEXT_DEV && !body.image) {
    throw new Error("NVIDIA FLUX.1 Kontext Dev requires an input image");
  }
  const requestBody = buildNvidiaNimRequestBody(model, body);
  log?.info?.("IMAGE", `nvidia/${model} (nvidia-nim) | prompt: "${String(body.prompt ?? "").slice(0, 60)}..."`);
  const url = `${BASE_URL.replace(/\/$/, "")}/${model}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const errorText = await response.text();
    log?.error?.("IMAGE", `nvidia error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error(errorText || `NVIDIA NIM error ${response.status}`);
  }
  const payload = await response.json();
  const normalized = normalizeNvidiaNimImages(payload);
  if (normalized.data.length === 0) throw new Error("No images returned from NVIDIA NIM");
  return normalized;
}

export default {
  buildUrl: (model) => `${BASE_URL.replace(/\/$/, "")}/${model}`,
  buildHeaders: (creds) => {
    const token = creds?.apiKey || creds?.accessToken || "";
    return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` };
  },
  buildBody: (model, body) => buildNvidiaNimRequestBody(model, body),
  normalize: (responseBody) => normalizeNvidiaNimImages(responseBody),
};
