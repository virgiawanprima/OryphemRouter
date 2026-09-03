import {
  buildUpscaleImageEntry,
  extractUpscaleSourceImage,
  resolveUpscaleImageSource,
  saveUpscaleErrorResult,
  saveUpscaleSuccessResult,
  scaleDimensions,
  sniffImageMime,
  toBlobBytes
} from "./shared.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
const MAX_OUTPUT_EDGE = 16e3;
const ALLOWED_OUTPUT_FORMATS = ["png", "jpeg", "webp"];
async function handleTopazImageUpscale({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log,
  fetchImpl = fetch
}) {
  const startTime = Date.now();
  const token = credentials.apiKey || credentials.accessToken;
  if (!token) {
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 401,
      startTime,
      error: "Missing Topaz Labs API key"
    });
  }
  const source = extractUpscaleSourceImage(body);
  if (!source) {
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 400,
      startTime,
      error: `Topaz Labs upscale model ${model} requires a source image`
    });
  }
  const factor = normalizeFactor(body);
  const outputFormat = normalizeOutputFormat(body.output_format ?? body.format);
  const requestSummary = { model, factor, output_format: outputFormat };
  try {
    const imageSource = await resolveUpscaleImageSource(source);
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([toBlobBytes(imageSource.buffer)], { type: imageSource.contentType || "image/png" }),
      "image"
    );
    formData.append("output_format", outputFormat);
    const explicitSize = parseExplicitSize(body.size ?? body.output_size);
    const target = explicitSize ?? scaleDimensions(imageSource.buffer, factor, MAX_OUTPUT_EDGE);
    if (target) {
      formData.append("output_width", String(target.width));
      formData.append("output_height", String(target.height));
      requestSummary.output_width = target.width;
      requestSummary.output_height = target.height;
    } else {
      log?.info?.(
        "IMAGE",
        `${provider}/${model} (topaz upscale) | source dimensions unknown \u2014 using Topaz default scale`
      );
    }
    const topazModel = typeof body.topaz_model === "string" ? body.topaz_model.trim() : "";
    if (topazModel) {
      formData.append("model", topazModel);
      requestSummary.topaz_model = topazModel;
    }
    appendUnitFloat(formData, "sharpen", body.sharpen, requestSummary);
    appendUnitFloat(formData, "denoise", body.denoise, requestSummary);
    appendUnitFloat(formData, "fix_compression", body.fix_compression, requestSummary);
    if (body.face_enhancement !== void 0 && body.face_enhancement !== null) {
      const enabled = toBoolean(body.face_enhancement);
      formData.append("face_enhancement", enabled ? "true" : "false");
      requestSummary.face_enhancement = enabled;
      if (enabled) {
        appendUnitFloat(
          formData,
          "face_enhancement_creativity",
          body.creativity ?? body.face_enhancement_creativity,
          requestSummary,
          /* percentAware */
          true
        );
        appendUnitFloat(
          formData,
          "face_enhancement_strength",
          body.face_enhancement_strength,
          requestSummary
        );
      }
    }
    log?.info?.(
      "IMAGE",
      `${provider}/${model} (topaz upscale) | ${factor}x` + (target ? ` \u2192 ${target.width}x${target.height}` : "") + ` | output=${outputFormat}`
    );
    const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
    const response = await fetchImpl(`${baseUrl}/image/v1/enhance`, {
      method: "POST",
      headers: {
        Accept: `image/${outputFormat}`,
        "X-API-Key": token
      },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log?.error?.(
        "IMAGE",
        `${provider} topaz upscale error ${response.status}: ${errorText.slice(0, 200)}`
      );
      return saveUpscaleErrorResult({
        provider,
        model,
        status: response.status,
        startTime,
        error: errorText || `HTTP ${response.status}`,
        requestBody: requestSummary
      });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      return saveUpscaleErrorResult({
        provider,
        model,
        status: 502,
        startTime,
        error: "Topaz Labs upscale returned an empty body",
        requestBody: requestSummary
      });
    }
    const declared = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const contentType = declared.startsWith("image/") ? declared : sniffImageMime(buffer);
    return saveUpscaleSuccessResult({
      provider,
      model,
      startTime,
      requestBody: requestSummary,
      images: [
        buildUpscaleImageEntry({ buffer, contentType, responseFormat: body.response_format })
      ],
      meta: { provider, model, factor, ...target ? { width: target.width, height: target.height } : {} }
    });
  } catch (err) {
    const errorText = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
    log?.error?.("IMAGE", `${provider} topaz upscale exception: ${errorText}`);
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 502,
      startTime,
      error: `Image upscale provider error: ${errorText}`,
      requestBody: requestSummary
    });
  }
}
function normalizeFactor(body) {
  const raw = body.factor ?? body.scale ?? body.upscale_factor ?? body.upscaleFactor ?? body.upsampler_factor ?? body.upsamplerFactor;
  let n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 2;
  return Math.abs(n - 4) < Math.abs(n - 2) ? 4 : 2;
}
function normalizeOutputFormat(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "jpg") return "jpeg";
  return ALLOWED_OUTPUT_FORMATS.includes(raw) ? raw : "png";
}
function parseExplicitSize(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    width: Math.min(width, MAX_OUTPUT_EDGE),
    height: Math.min(height, MAX_OUTPUT_EDGE)
  };
}
function appendUnitFloat(formData, key, value, summary, percentAware = false) {
  if (value === void 0 || value === null || String(value).trim() === "") return;
  let n = typeof value === "number" ? value : Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(n)) return;
  if (percentAware && n > 1) n = n / 100;
  n = Math.max(0, Math.min(1, n));
  const rounded = Math.round(n * 100) / 100;
  formData.append(key, String(rounded));
  summary[key] = rounded;
}
function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}
export {
  handleTopazImageUpscale
};
