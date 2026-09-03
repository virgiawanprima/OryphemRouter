// AI Horde request mapping helpers — ported from OmniRoute
// imageGeneration/providers/aihordeMapRequest.ts.
// Maps OpenAI image request bodies onto AI Horde generate payloads.

const MAX_N = 4;
const MIN_DIM = 64;
const MAX_DIM = 3072;
const DIM_STEP = 64;
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const DEFAULT_DENOISING = 0.75;
const DEFAULT_STEPS = 20;

const SIZE_RE = /^\s*(\d+)\s*x\s*(\d+)\s*$/i;
const DATA_URL_RE = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i;

export function stripHordeModelPrefix(model) {
  const name = model.trim();
  const lower = name.toLowerCase();
  if (lower.startsWith("aihorde/")) return name.slice("aihorde/".length);
  if (lower.startsWith("horde/")) return name.slice("horde/".length);
  return name;
}

export function snapHordeDim(value) {
  const snapped = Math.round(value / DIM_STEP) * DIM_STEP;
  return Math.max(MIN_DIM, Math.min(MAX_DIM, snapped));
}

export function parseHordeSize(size) {
  if (!size) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const match = SIZE_RE.exec(size);
  if (!match) {
    throw new Error(`size must look like WIDTHxHEIGHT, got ${JSON.stringify(size)}`);
  }
  return { width: snapHordeDim(Number(match[1])), height: snapHordeDim(Number(match[2])) };
}

export function capHordeN(n) {
  if (n === null || n === undefined) return 1;
  const value = Number(n);
  if (!Number.isFinite(value)) {
    throw new Error("n must be an integer");
  }
  if (value < 1) {
    throw new Error("n must be at least 1");
  }
  return Math.min(Math.trunc(value), MAX_N);
}

function stripDataUrl(value) {
  const match = DATA_URL_RE.exec(value.trim());
  return match ? match[2].trim() : value.trim();
}

function coerceHordeImage(value) {
  if (value && typeof value === "object") {
    const obj = value;
    for (const key of ["image_url", "url", "b64_json", "image"]) {
      const inner = obj[key];
      if (typeof inner === "string" && inner.trim()) return stripDataUrl(inner);
    }
    throw new Error("image object is missing image_url, url, b64_json, or image");
  }
  if (typeof value === "string" && value.trim()) return stripDataUrl(value);
  throw new Error("image must be a data URL, raw base64 string, or image object");
}

export function extractHordeSourceB64(body) {
  const images = body.images;
  if (Array.isArray(images) && images.length > 0) {
    return coerceHordeImage(images[0]);
  }
  if (body.image !== undefined) return coerceHordeImage(body.image);
  if (typeof body.image_url === "string" && body.image_url.trim()) {
    return coerceHordeImage(body.image_url);
  }
  return null;
}

export function mapHordeGenerateRequest(body, options = {}) {
  const prompt = body.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("prompt is required");
  }
  const model = body.model;
  if (typeof model !== "string" || !model.trim()) {
    throw new Error("model is required");
  }
  const hordeModel = stripHordeModelPrefix(model);
  if (!hordeModel) {
    throw new Error("model is empty after stripping aihorde/horde prefix");
  }
  const size = typeof body.size === "string" ? body.size : null;
  const { width, height } = parseHordeSize(size);
  const payload = {
    prompt,
    models: [hordeModel],
    nsfw: false,
    censor_nsfw: true,
    r2: true,
    shared: false,
    validated_backends: true,
    slow_workers: true,
    allow_downgrade: true,
    params: {
      n: capHordeN(body.n),
      width,
      height,
      steps: options.steps ?? DEFAULT_STEPS,
    },
  };
  if (options.sourceImage) {
    payload.source_image = options.sourceImage;
    payload.source_processing = "img2img";
    payload.params.denoising_strength = DEFAULT_DENOISING;
  }
  return payload;
}
