import {
  AdobeFireflyError,
  resolveAdobeAccessToken,
  resolveAdobeSourceImageIds
} from "../../utils/omni/adobeFireflyClient.js";
import {
  adobeFireflyUpscaleImage,
  resolveAdobeUpscaleModel
} from "../../utils/omni/adobeFireflyUpscale.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import {
  extractUpscaleSourceImage,
  saveUpscaleErrorResult,
  saveUpscaleSuccessResult
} from "./shared.js";
async function handleAdobeFireflyImageUpscale({
  model,
  provider,
  body,
  credentials,
  log,
  fetchImpl = fetch
}) {
  const startTime = Date.now();
  const resolved = resolveAdobeUpscaleModel(model);
  if (!resolved) {
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 400,
      startTime,
      error: `Unsupported Adobe Firefly upscale model: ${model}. Use topaz-standard or topaz-bloom.`
    });
  }
  if (!extractUpscaleSourceImage(body)) {
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 400,
      startTime,
      error: "Adobe Firefly upscale requires a source image"
    });
  }
  try {
    const accessToken = await resolveAdobeAccessToken(credentials, fetchImpl);
    const psd = credentials?.providerSpecificData;
    const sessionCookie = typeof psd?.cookie === "string" && psd.cookie.trim() || typeof credentials?.apiKey === "string" && credentials.apiKey.trim() || (typeof credentials?.accessToken === "string" && credentials.accessToken.includes(";") ? credentials.accessToken : void 0);
    const blobIds = await resolveAdobeSourceImageIds({
      accessToken,
      body,
      max: 1,
      sessionCookie,
      prompt: "upsample",
      fetchImpl,
      log
    });
    if (blobIds.length === 0) {
      return saveUpscaleErrorResult({
        provider,
        model,
        status: 400,
        startTime,
        error: "Adobe Firefly upscale could not resolve the source image"
      });
    }
    const timeoutMs = normalizePositiveNumber(body.timeout_ms, 0);
    const result = await adobeFireflyUpscaleImage({
      accessToken,
      model,
      blobId: blobIds[0],
      upsamplerFactor: readFactor(body),
      creativityPercent: readCreativityPercent(body),
      creativityLevel: body.creativity_level ?? body.creativityLevel,
      sessionCookie,
      ...timeoutMs > 0 ? { timeoutMs } : {},
      fetchImpl,
      log
    });
    log?.info?.(
      "IMAGE",
      `${provider}/${model} (adobe-firefly upsample) | ${result.factor}x` + (resolved.spec.supportsCreativity ? ` | creativityLevel=${result.creativityLevel}` : "")
    );
    return saveUpscaleSuccessResult({
      provider,
      model,
      startTime,
      images: [{ url: result.url }],
      meta: {
        provider,
        model,
        factor: result.factor,
        ...resolved.spec.supportsCreativity ? { creativity_level: result.creativityLevel } : {}
      }
    });
  } catch (err) {
    if (err instanceof AdobeFireflyError) {
      log?.error?.("IMAGE", `${provider} adobe-firefly upscale error ${err.status}: ${err.message}`);
      return saveUpscaleErrorResult({
        provider,
        model,
        status: err.status,
        startTime,
        error: err.message
      });
    }
    const errorText = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
    log?.error?.("IMAGE", `${provider} adobe-firefly upscale exception: ${errorText}`);
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 500,
      startTime,
      error: errorText
    });
  }
}
function readFactor(body) {
  return body.factor ?? body.scale ?? body.upscale_factor ?? body.upscaleFactor ?? body.upsampler_factor ?? body.upsamplerFactor;
}
function readCreativityPercent(body) {
  const raw = body.creativity ?? body.creativity_percent ?? body.creativityPercent;
  if (raw === void 0 || raw === null) return void 0;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace("%", "").trim());
  if (!Number.isFinite(n)) return void 0;
  if (n > 0 && n < 1) return Math.max(0, Math.min(100, n * 100));
  return Math.max(0, Math.min(100, n));
}
function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
export {
  handleAdobeFireflyImageUpscale
};
