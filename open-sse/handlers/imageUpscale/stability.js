import {
  buildUpscaleImageEntry,
  extractUpscaleSourceImage,
  resolveUpscaleImageSource,
  saveUpscaleErrorResult,
  saveUpscaleSuccessResult,
  toBlobBytes
} from "./shared.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
const UPSCALE_ENDPOINTS = {
  fast: "/v2beta/stable-image/upscale/fast",
  conservative: "/v2beta/stable-image/upscale/conservative",
  creative: "/v2beta/stable-image/upscale/creative"
};
const CREATIVITY_RANGES = {
  conservative: { min: 0.2, max: 0.5, fallback: 0.35 },
  creative: { min: 0, max: 0.35, fallback: 0.3 }
};
const PROMPT_REQUIRED = /* @__PURE__ */ new Set(["conservative", "creative"]);
const ASYNC_MODELS = /* @__PURE__ */ new Set(["creative"]);
const RESULT_POLL_INTERVAL_MS = 3e3;
const DEFAULT_RESULT_TIMEOUT_MS = 3e5;
const ALLOWED_OUTPUT_FORMATS = ["png", "jpeg", "webp"];
async function handleStabilityImageUpscale({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log,
  fetchImpl = fetch
}) {
  const startTime = Date.now();
  const endpoint = UPSCALE_ENDPOINTS[model];
  if (!endpoint) {
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 400,
      startTime,
      error: `Unsupported Stability AI upscale model: ${model}. Use fast, conservative or creative.`
    });
  }
  const token = credentials.apiKey || credentials.accessToken;
  if (!token) {
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 401,
      startTime,
      error: "Missing Stability AI API key"
    });
  }
  const source = extractUpscaleSourceImage(body);
  if (!source) {
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 400,
      startTime,
      error: `Stability AI upscale model ${model} requires a source image`
    });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (PROMPT_REQUIRED.has(model) && !prompt) {
    return saveUpscaleErrorResult({
      provider,
      model,
      status: 400,
      startTime,
      error: `Stability AI "${model}" upscale requires a prompt describing the image. Use the "fast" model for a prompt-free 4x upscale.`
    });
  }
  const outputFormat = normalizeOutputFormat(body.output_format ?? body.format);
  const creativity = CREATIVITY_RANGES[model] ? mapCreativity(body, CREATIVITY_RANGES[model]) : null;
  const requestSummary = { model, output_format: outputFormat };
  if (prompt) requestSummary.prompt = prompt;
  if (creativity !== null) requestSummary.creativity = creativity;
  try {
    const imageSource = await resolveUpscaleImageSource(source);
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([toBlobBytes(imageSource.buffer)], { type: imageSource.contentType || "image/png" }),
      "image"
    );
    formData.append("output_format", outputFormat);
    if (prompt) formData.append("prompt", prompt);
    if (typeof body.negative_prompt === "string" && body.negative_prompt.trim()) {
      formData.append("negative_prompt", body.negative_prompt.trim());
    }
    if (creativity !== null) formData.append("creativity", String(creativity));
    if (body.seed !== void 0 && body.seed !== null && String(body.seed).trim()) {
      formData.append("seed", String(body.seed));
    }
    if (typeof body.style_preset === "string" && body.style_preset.trim()) {
      formData.append("style_preset", body.style_preset.trim());
    }
    log?.info?.(
      "IMAGE",
      `${provider}/${model} (stability upscale)` + (creativity !== null ? ` | creativity=${creativity}` : "") + ` | output=${outputFormat}`
    );
    const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log?.error?.(
        "IMAGE",
        `${provider} stability upscale error ${response.status}: ${errorText.slice(0, 200)}`
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
    const payload = await response.json().catch(() => ({}));
    let finalPayload = payload;
    if (ASYNC_MODELS.has(model) && typeof payload.id === "string" && payload.id) {
      finalPayload = await pollStabilityResult({
        baseUrl,
        token,
        id: payload.id,
        timeoutMs: normalizePositiveNumber(body.timeout_ms, DEFAULT_RESULT_TIMEOUT_MS),
        fetchImpl,
        log
      });
    }
    const finishReason = String(finalPayload.finish_reason ?? "").toUpperCase();
    if (finishReason === "CONTENT_FILTERED") {
      return saveUpscaleErrorResult({
        provider,
        model,
        status: 400,
        startTime,
        error: "Stability AI filtered the upscale result (CONTENT_FILTERED)",
        requestBody: requestSummary
      });
    }
    const base64 = typeof finalPayload.image === "string" ? finalPayload.image : "";
    if (!base64) {
      return saveUpscaleErrorResult({
        provider,
        model,
        status: 502,
        startTime,
        error: "Stability AI upscale returned no image",
        requestBody: requestSummary
      });
    }
    const buffer = Buffer.from(base64, "base64");
    return saveUpscaleSuccessResult({
      provider,
      model,
      startTime,
      requestBody: requestSummary,
      images: [
        buildUpscaleImageEntry({
          buffer,
          contentType: `image/${outputFormat === "jpeg" ? "jpeg" : outputFormat}`,
          responseFormat: body.response_format
        })
      ],
      meta: {
        provider,
        model,
        factor: 4,
        ...creativity !== null ? { creativity } : {},
        ...finalPayload.seed !== void 0 ? { seed: finalPayload.seed } : {}
      }
    });
  } catch (err) {
    const errorText = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
    log?.error?.("IMAGE", `${provider} stability upscale exception: ${errorText}`);
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
async function pollStabilityResult(opts) {
  const deadline = Date.now() + opts.timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const response = await opts.fetchImpl(
      `${opts.baseUrl}/v2beta/results/${encodeURIComponent(opts.id)}`,
      {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` }
      }
    );
    if (response.status === 202) {
      opts.log?.info?.("IMAGE", `stability creative upscale pending #${attempt}`);
      await sleep(RESULT_POLL_INTERVAL_MS);
      continue;
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 429 || response.status >= 500) {
        await sleep(RESULT_POLL_INTERVAL_MS);
        continue;
      }
      throw new Error(
        `Stability AI upscale result failed (${response.status}): ${text.slice(0, 300)}`
      );
    }
    return await response.json().catch(() => ({}));
  }
  throw new Error("Stability AI creative upscale timed out");
}
function normalizeOutputFormat(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "jpg") return "jpeg";
  return ALLOWED_OUTPUT_FORMATS.includes(raw) ? raw : "png";
}
function mapCreativity(body, range) {
  const raw = body.creativity ?? body.creativity_percent ?? body.creativityPercent;
  if (raw === void 0 || raw === null || String(raw).trim() === "") return range.fallback;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace("%", "").trim());
  if (!Number.isFinite(n)) return range.fallback;
  if (n > 0 && n < 1) return round2(Math.max(range.min, Math.min(range.max, n)));
  const percent = Math.max(0, Math.min(100, n));
  return round2(range.min + (range.max - range.min) * percent / 100);
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
export {
  handleStabilityImageUpscale
};
