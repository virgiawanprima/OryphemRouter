// Adobe Firefly image generation — ported from OmniRoute
// imageGeneration/providers/adobeFirefly.ts (handleAdobeFireflyImageGeneration).
// Uses the ported adobeFireflyClient + adobeFireflySession services for
// durable session handling (JWT/Cookie → ARP), reference-image upload, and
// async generate + poll. Returns an image URL.
import { nowSec } from "./_base.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import {
  AdobeFireflyError,
  adobeFireflyGenerateImage,
  resolveAdobeSourceImageIds,
  resolveAdobeImageModel,
} from "../../services/adobeFireflyClient.js";
import { ensureAdobeFireflySession } from "../../services/adobeFireflySession.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL =
  PROVIDER_MEDIA["adobe-firefly"]?.imageConfig?.baseUrl ||
  "https://firefly-3p.ff.adobe.io/v2/3p-images/generate-async";

const DEFAULT_MODELS = ["nano-banana-pro", "nano-banana-2", "sora-2", "gpt-image-1", "firefly"];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new Error("Prompt is required for Adobe Firefly image generation");

  const session = await ensureAdobeFireflySession({ credentials, fetchImpl, log });
  const accessToken = session.accessToken;
  const sessionCookie = session.cookie || undefined;
  const arpSessionId = session.arpSessionId;
  const timeoutMs = normalizePositiveNumber(body.timeout_ms, 180_000);
  const seed =
    typeof body.seed === "number"
      ? body.seed
      : typeof body.seed === "string" && body.seed.trim()
        ? Number(body.seed)
        : undefined;

  const { id: resolvedId } = resolveAdobeImageModel(model);
  const maxRefs = resolvedId.includes("nano-banana") || resolvedId.includes("gpt-image") ? 4 : 2;

  const sourceImageIds = await resolveAdobeSourceImageIds({
    accessToken,
    body,
    max: maxRefs,
    sessionCookie,
    arpSessionId,
    prompt,
    fetchImpl,
    log,
  });

  log?.info?.(
    "IMAGE",
    `${model} (adobe-firefly) | prompt: "${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}"` +
      (sourceImageIds.length ? ` | refs: ${sourceImageIds.length}` : "") +
      ` | session=${session.source}`
  );

  const result = await adobeFireflyGenerateImage({
    accessToken,
    prompt,
    model,
    size: body.size,
    aspectRatio: body.aspect_ratio ?? body.aspectRatio ?? body.size,
    quality: body.quality,
    seed: Number.isFinite(seed) ? seed : undefined,
    negativePrompt: typeof body.negative_prompt === "string" ? body.negative_prompt : undefined,
    sourceImageIds: sourceImageIds.length ? sourceImageIds : undefined,
    sessionCookie,
    arpSessionId,
    sessionFingerprint: session.fingerprint,
    sessionBrowserKey: session.browserSessionKey,
    timeoutMs,
    fetchImpl,
    log,
  });

  return { created: nowSec(), data: [{ url: result.url }] };
}

export default {
  // Delegates to the ported client/session services (session, ARP, uploads, poll)
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
