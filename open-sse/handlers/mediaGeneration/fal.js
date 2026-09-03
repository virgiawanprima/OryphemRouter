import { saveCallLog } from "../../utils/omni/usageDb.js";
import {
  FetchTimeoutError,
  fetchWithTimeout,
  getConfiguredTimeout
} from "../../utils/omni/fetchTimeout.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter((value2) => Boolean(value2));
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function falDuration(value, fallback) {
  if (typeof value === "string" && /^(4|6|8)s$/.test(value)) return value;
  const numeric = numberValue(value);
  return numeric && [4, 6, 8].includes(numeric) ? `${numeric}s` : fallback;
}
function grokDuration(value, fallback = 6) {
  const numeric = numberValue(value);
  if (numeric !== void 0) return Math.round(numeric);
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d+)s$/);
    if (match) return Number(match[1]);
  }
  return fallback;
}
function geminiDuration(value, fallback = 8) {
  const numeric = numberValue(value);
  const parsed = numeric ?? (typeof value === "string" && /^\d+(?:\.\d+)?s$/.test(value.trim()) ? Number(value.trim().slice(0, -1)) : void 0);
  return parsed === void 0 ? fallback : Math.min(10, Math.max(3, Math.round(parsed)));
}
function buildFalVideoRequestBody(body, model = "") {
  if (model.startsWith("google/gemini-omni-flash")) {
    const request2 = {
      prompt: stringValue(body.prompt) || "",
      aspect_ratio: stringValue(body.aspect_ratio) || "16:9",
      duration: geminiDuration(body.duration)
    };
    const imageUrl = stringValue(body.image_url) || stringArray(body.image_urls)[0];
    if (imageUrl) request2.image_url = imageUrl;
    return request2;
  }
  if (model.startsWith("xai/grok-imagine-video/")) {
    const request2 = {
      prompt: stringValue(body.prompt) || "",
      aspect_ratio: stringValue(body.aspect_ratio) || "16:9",
      duration: grokDuration(body.duration),
      resolution: stringValue(body.resolution) || "720p"
    };
    const imageUrls = stringArray(body.image_urls);
    if (imageUrls.length === 1) {
      request2.image_url = imageUrls[0];
    } else if (imageUrls.length > 1) {
      request2.reference_image_urls = imageUrls;
    }
    return request2;
  }
  const request = {
    prompt: stringValue(body.prompt) || "",
    aspect_ratio: stringValue(body.aspect_ratio) || "16:9",
    duration: falDuration(body.duration, "8s"),
    resolution: stringValue(body.resolution) || (body.quality === "hd" ? "1080p" : "720p"),
    generate_audio: typeof body.generate_audio === "boolean" ? body.generate_audio : true
  };
  const optionalStringFields = ["negative_prompt", "safety_tolerance"];
  for (const field of optionalStringFields) {
    const value = stringValue(body[field]);
    if (value) request[field] = value;
  }
  const seed = numberValue(body.seed);
  if (seed !== void 0) request.seed = seed;
  if (typeof body.auto_fix === "boolean") request.auto_fix = body.auto_fix;
  return request;
}
function resolveFalModel(model, body, kind) {
  if (kind !== "video") return model;
  if (model.startsWith("google/gemini-omni-flash") && !model.endsWith("/image-to-video")) {
    const hasImage = typeof body.image_url === "string" || stringArray(body.image_urls).length > 0;
    return hasImage ? "google/gemini-omni-flash/image-to-video" : model;
  }
  if (!model.startsWith("xai/grok-imagine-video/")) return model;
  const suffix = Array.isArray(body.reference_image_urls) ? "reference-to-video" : typeof body.image_url === "string" ? "image-to-video" : "text-to-video";
  return `xai/grok-imagine-video/${suffix}`;
}
function buildFalMusicRequestBody(body) {
  const request = {
    tags: stringValue(body.tags) || stringValue(body.prompt) || ""
  };
  const lyrics = stringValue(body.lyrics);
  if (lyrics) request.lyrics = lyrics;
  const duration = numberValue(body.duration);
  if (duration !== void 0) request.duration = Math.min(240, Math.max(5, duration));
  const seed = numberValue(body.seed);
  if (seed !== void 0) request.seed = seed;
  const optionalNumberFields = [
    "number_of_steps",
    "granularity_scale",
    "guidance_interval",
    "guidance_interval_decay",
    "tag_guidance_scale",
    "lyric_guidance_scale",
    "minimum_guidance_scale",
    "guidance_scale"
  ];
  for (const field of optionalNumberFields) {
    const value = numberValue(body[field]);
    if (value !== void 0) request[field] = value;
  }
  const scheduler = stringValue(body.scheduler);
  if (scheduler === "euler" || scheduler === "heun") request.scheduler = scheduler;
  const guidanceType = stringValue(body.guidance_type);
  if (guidanceType === "cfg" || guidanceType === "apg" || guidanceType === "cfg_star") {
    request.guidance_type = guidanceType;
  }
  return request;
}
function extensionFromMedia(item, kind) {
  const contentType = stringValue(item.content_type);
  if (contentType?.includes("/")) return contentType.split("/", 2)[1];
  const fileName = stringValue(item.file_name);
  const url = stringValue(item.url);
  const candidate = fileName || url || "";
  const extension = candidate.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toLowerCase();
  return extension || (kind === "video" ? "mp4" : "wav");
}
function normalizeFalMediaResult(payload, kind) {
  const record = payload && typeof payload === "object" ? payload : {};
  const media = record[kind === "video" ? "video" : "audio"];
  const item = media && typeof media === "object" ? media : null;
  const url = stringValue(item?.url);
  if (!url) {
    return {
      success: false,
      status: 502,
      error: `Fal ${kind} generation returned no media URL`
    };
  }
  return {
    success: true,
    data: {
      created: numberValue(record.created) || 0,
      data: [{ url, format: extensionFromMedia(item, kind) }]
    }
  };
}
function absoluteFalUrl(value, baseUrl) {
  const url = stringValue(value);
  if (!url) return void 0;
  return url.startsWith("http://") || url.startsWith("https://") ? url : `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}
function getToken(credentials) {
  return String(credentials?.apiKey || credentials?.accessToken || "");
}
async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function runFalQueue({
  model,
  body,
  kind,
  provider,
  providerConfig,
  credentials,
  log
}) {
  const startTime = Date.now();
  const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
  const token = getToken(credentials);
  if (!token) {
    return { success: false, status: 401, error: "Fal API key is required" };
  }
  const headers = {
    Authorization: `Key ${token}`,
    "Content-Type": "application/json"
  };
  const timeoutMs = getConfiguredTimeout();
  const deadline = startTime + timeoutMs;
  const resolvedModel = resolveFalModel(model, body, kind);
  const falModel = resolvedModel.startsWith("fal-ai/") || resolvedModel.startsWith("xai/") || resolvedModel.startsWith("google/") ? resolvedModel : `fal-ai/${resolvedModel}`;
  const queueUrl = `${baseUrl}/${falModel}`;
  try {
    const createResponse = await fetchWithTimeout(queueUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      timeoutMs
    });
    const createPayload = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      const error = JSON.stringify(createPayload).slice(0, 500);
      log?.error?.(
        "MEDIA",
        `${provider} ${kind} create failed (${createResponse.status}): ${error}`
      );
      saveCallLog({
        method: "POST",
        path: `/v1/${kind === "video" ? "videos" : "music"}/generations`,
        status: createResponse.status,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error
      }).catch(() => {
      });
      return { success: false, status: createResponse.status, error };
    }
    const requestId = stringValue(createPayload?.request_id);
    if (!requestId) {
      const normalized = normalizeFalMediaResult(createPayload, kind);
      if (!normalized.success) return normalized;
      return normalized;
    }
    const statusUrl = absoluteFalUrl(createPayload.status_url, baseUrl) || `${queueUrl}/requests/${requestId}/status`;
    const responseUrl = absoluteFalUrl(createPayload.response_url, baseUrl) || `${queueUrl}/requests/${requestId}`;
    while (Date.now() < deadline) {
      const statusResponse = await fetchWithTimeout(statusUrl, {
        headers: { Authorization: `Key ${token}` },
        timeoutMs: Math.min(getConfiguredTimeout(), Math.max(1e3, deadline - Date.now()))
      });
      const statusPayload = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) {
        const error = JSON.stringify(statusPayload).slice(0, 500);
        return { success: false, status: statusResponse.status, error };
      }
      const status = stringValue(statusPayload?.status);
      if (status === "COMPLETED") {
        const resultResponse = await fetchWithTimeout(responseUrl, {
          headers: { Authorization: `Key ${token}` },
          timeoutMs: Math.min(getConfiguredTimeout(), Math.max(1e3, deadline - Date.now()))
        });
        const resultPayload = await resultResponse.json().catch(() => ({}));
        if (!resultResponse.ok) {
          return {
            success: false,
            status: resultResponse.status,
            error: JSON.stringify(resultPayload).slice(0, 500)
          };
        }
        const normalized = normalizeFalMediaResult(resultPayload, kind);
        saveCallLog({
          method: "POST",
          path: `/v1/${kind === "video" ? "videos" : "music"}/generations`,
          status: normalized.success ? 200 : normalized.status,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime,
          ...normalized.success ? {} : { error: normalized.error }
        }).catch(() => {
        });
        return normalized;
      }
      if (status && !["IN_QUEUE", "IN_PROGRESS"].includes(status)) {
        return {
          success: false,
          status: 502,
          error: `Fal ${kind} generation ended with status ${status}`
        };
      }
      await wait(Math.min(1e3, Math.max(100, deadline - Date.now())));
    }
    return {
      success: false,
      status: 504,
      error: `Fal ${kind} generation timed out after ${timeoutMs}ms`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof FetchTimeoutError || error?.name === "AbortError";
    const status = isTimeout ? 504 : 502;
    log?.error?.("MEDIA", `${provider} ${kind} request failed: ${sanitizeErrorMessage(message)}`);
    return {
      success: false,
      status,
      error: `Fal ${kind} provider error: ${sanitizeErrorMessage(message)}`
    };
  }
}
function handleFalVideoGeneration(args) {
  return runFalQueue({
    ...args,
    body: buildFalVideoRequestBody(args.body, args.model),
    kind: "video"
  });
}
function handleFalMusicGeneration(args) {
  return runFalQueue({ ...args, body: buildFalMusicRequestBody(args.body), kind: "music" });
}
export {
  buildFalMusicRequestBody,
  buildFalVideoRequestBody,
  handleFalMusicGeneration,
  handleFalVideoGeneration,
  normalizeFalMediaResult
};
