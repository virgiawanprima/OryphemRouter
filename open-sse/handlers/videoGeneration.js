import { getVideoProvider, parseVideoModel } from "../utils/omni/videoRegistry.js";
import { kieExecutor } from "../utils/omni/kie.js";
import { vertexGenerateVideo } from "../utils/omni/vertexMedia.js";
import { handleGoogleFlowVideoGeneration } from "../utils/omni/videoGenHandlers.js";
import { handleDeepinfraVideoGeneration } from "../utils/omni/videoGenHandlers.js";
import { handleLeonardoVideoGeneration } from "../utils/omni/videoGenHandlers.js";
import { handleDashscopeVideoGeneration } from "./videoGeneration/dashscopeHandler.js";
import { handleNovitaVideoGeneration } from "../utils/omni/videoGenHandlers.js";
import { handleXaiVideoGeneration } from "../utils/omni/videoGenHandlers.js";
import { handleSegmindVideoGeneration } from "../utils/omni/videoGenHandlers.js";
import { handleAdobeFireflyVideoGeneration } from "../utils/omni/videoGenHandlers.js";
import { handleOpenAIVideoGeneration } from "../utils/omni/videoGenHandlers.js";
import { getVideoJobPreset, handleVideoJobGeneration } from "./videoGeneration/job.js";
import {
  extractRunwayFailureMessage,
  normalizeRunwayVideoResult,
  resolvePositiveInteger,
  resolveRunwayDuration,
  resolveRunwayPromptImage,
  resolveRunwayRatio
} from "../utils/omni/videoGenHandlers.js";
import { getExecutor } from "../executors/index.js";
import { getKieTaskId, isJsonObject, parseKieResultJson } from "../utils/omni/kieTask.js";
import {
  buildRunwayApiUrl,
  buildRunwayHeaders,
  RUNWAYML_IMAGE_REQUIRED_MODELS
} from "../utils/omni/runway.js";
import {
  submitComfyWorkflow,
  pollComfyResult,
  fetchComfyOutput,
  extractComfyOutputFiles,
  resolveComfyUiBaseUrl
} from "../utils/omni/comfyuiClient.js";
import { saveCallLog } from "../utils/omni/usageDb.js";
import { getAllCustomModels } from "../utils/omni/dbModels.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { handleFalVideoGeneration } from "./mediaGeneration/fal.js";
function resolveVideoBaseUrl(credentials, fallback) {
  const psd = credentials?.providerSpecificData;
  const psdBaseUrl = psd && typeof psd === "object" && typeof psd.baseUrl === "string" && psd.baseUrl.trim() ? psd.baseUrl.trim() : null;
  const topLevelBaseUrl = typeof credentials?.baseUrl === "string" && credentials.baseUrl.trim() ? credentials.baseUrl.trim() : null;
  const nodeBaseUrl = psdBaseUrl || topLevelBaseUrl;
  if (!nodeBaseUrl) return fallback;
  let normalized = nodeBaseUrl;
  while (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  if (normalized.endsWith("/videos/generations")) return normalized;
  const stripped = normalized.replace(/\/videos\/generations$/, "");
  return `${stripped}/videos/generations`;
}
async function getCustomModelVideoPreset(providerId, modelId) {
  try {
    const customModelsMap = await getAllCustomModels();
    const models = customModelsMap[providerId];
    if (!Array.isArray(models)) return null;
    for (const model of models) {
      if (!model || typeof model !== "object" || model.id !== modelId) continue;
      const generationConfig = model.generationConfig;
      if (generationConfig && typeof generationConfig === "object" && typeof generationConfig.preset === "string") {
        return generationConfig.preset;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}
async function handleVideoGeneration({ body, credentials, log, resolvedProvider = null }) {
  let { provider, model } = parseVideoModel(body.model);
  if (resolvedProvider) {
    provider = resolvedProvider;
    model = body.model.startsWith(provider + "/") ? body.model.slice(provider.length + 1) : body.model;
  }
  if (!provider) {
    return {
      success: false,
      status: 400,
      error: `Invalid video model: ${body.model}. Use format: provider/model`
    };
  }
  const providerConfig = getVideoProvider(provider);
  if (!providerConfig) {
    if (!resolvedProvider) {
      return {
        success: false,
        status: 400,
        error: `Unknown video provider: ${provider}`
      };
    }
    const presetName = await getCustomModelVideoPreset(provider, model);
    if (presetName !== null) {
      if (!getVideoJobPreset(presetName)) {
        return {
          success: false,
          status: 502,
          error: `Unknown video job preset: ${presetName}`
        };
      }
      if (log)
        log.info("VIDEO", `Custom model ${provider}/${model} \u2014 using job preset ${presetName}`);
      return handleVideoJobGeneration({
        model,
        presetName,
        body,
        credentials,
        log
      });
    }
    if (log)
      log.info("VIDEO", `Custom model ${provider}/${model} \u2014 using OpenAI-compatible handler`);
    const syntheticConfig = {
      id: provider,
      baseUrl: resolveVideoBaseUrl(
        credentials,
        "http://generative.language.googleapis.com/v1beta/openai/videos/generations"
      ),
      authType: "apikey",
      authHeader: "bearer",
      format: "openai-video"
    };
    return handleOpenAIVideoGeneration({
      model,
      body,
      credentials,
      provider,
      providerConfig: syntheticConfig,
      log
    });
  }
  if (getVideoJobPreset(providerConfig.format)) {
    return handleVideoJobGeneration({
      model,
      presetName: providerConfig.format,
      body,
      credentials,
      log
    });
  }
  if (providerConfig.format === "openai-video") {
    return handleOpenAIVideoGeneration({ model, provider, providerConfig, body, credentials, log });
  }
  if (providerConfig.format === "vertex-veo") {
    return handleVertexVeoGeneration({ model, body, credentials, log });
  }
  if (providerConfig.format === "fal-ai-video") {
    return handleFalVideoGeneration({ model, provider, providerConfig, body, credentials, log });
  }
  if (providerConfig.format === "google-flow") {
    return handleGoogleFlowVideoGeneration({ model, providerConfig, body, credentials, log });
  }
  if (providerConfig.format === "comfyui") {
    return handleComfyUIVideoGeneration({
      model,
      provider,
      providerConfig: {
        ...providerConfig,
        baseUrl: resolveComfyUiBaseUrl(credentials, providerConfig.baseUrl)
      },
      body,
      log
    });
  }
  if (providerConfig.format === "sdwebui-video") {
    return handleSDWebUIVideoGeneration({ model, provider, providerConfig, body, log });
  }
  if (providerConfig.format === "kie-video") {
    return handleKieVideoGeneration({ model, provider, providerConfig, body, credentials, log });
  }
  if (providerConfig.format === "runwayml") {
    return handleRunwayVideoGeneration({ model, provider, providerConfig, body, credentials, log });
  }
  if (providerConfig.format === "haiper-video") {
    return handleHaiperVideoGeneration({ model, provider, providerConfig, body, credentials, log });
  }
  if (providerConfig.format === "veoaifree-web") {
    return handleVeoAiFreeVideoGeneration({ model, provider, body, credentials, log });
  }
  if (providerConfig.format === "leonardo-video") {
    return handleLeonardoVideoGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log
    });
  }
  if (providerConfig.format === "deepinfra-video") {
    return handleDeepinfraVideoGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log
    });
  }
  if (providerConfig.format === "dashscope-video") {
    return handleDashscopeVideoGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log
    });
  }
  if (providerConfig.format === "segmind") {
    return handleSegmindVideoGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log
    });
  }
  if (providerConfig.format === "novita-video") {
    return handleNovitaVideoGeneration({ model, provider, providerConfig, body, credentials, log });
  }
  if (providerConfig.format === "xai-video") {
    return handleXaiVideoGeneration({ model, provider, providerConfig, body, credentials, log });
  }
  if (providerConfig.format === "adobe-firefly-video") {
    return handleAdobeFireflyVideoGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log
    });
  }
  if (resolvedProvider) {
    return handleOpenAIVideoGeneration({ model, provider, providerConfig, body, credentials, log });
  }
  return {
    success: false,
    status: 400,
    error: `Unsupported video format: ${providerConfig.format}`
  };
}
async function handleVertexVeoGeneration({ model, body, credentials, log }) {
  try {
    const aspectRatio = typeof body.aspect_ratio === "string" ? body.aspect_ratio : typeof body.aspectRatio === "string" ? body.aspectRatio : typeof body.size === "string" ? body.size : void 0;
    const durationSeconds = typeof body.duration === "number" ? body.duration : typeof body.durationSeconds === "number" ? body.durationSeconds : void 0;
    const result = await vertexGenerateVideo(credentials, {
      model,
      prompt: String(body.prompt ?? ""),
      aspectRatio,
      durationSeconds,
      negativePrompt: typeof body.negative_prompt === "string" ? body.negative_prompt : void 0
    });
    const item = result.base64 ? { b64_json: result.base64, format: result.format } : { url: result.url, format: result.format };
    return {
      success: true,
      data: { created: Math.floor(Date.now() / 1e3), data: [item] }
    };
  } catch (err) {
    log?.error?.("VIDEO", `Vertex Veo generation failed: ${err?.message}`);
    return {
      success: false,
      status: typeof err?.status === "number" ? err.status : 502,
      error: sanitizeErrorMessage(err?.message || "Vertex Veo generation failed")
    };
  }
}
async function handleVeoAiFreeVideoGeneration({ model, provider, body, credentials, log }) {
  const executor = getExecutor(provider);
  if (!executor) {
    return { success: false, status: 400, error: `Unknown video provider: ${provider}` };
  }
  const prompt = String(body.prompt ?? "");
  const systemParts = [];
  if (body.size) systemParts.push(`aspect_ratio: ${body.size}`);
  if (body.aspect_ratio) systemParts.push(`aspect_ratio: ${body.aspect_ratio}`);
  const response = await executor.execute({
    model,
    body: {
      ...body,
      model: `${provider}/${model}`,
      messages: [
        ...systemParts.length > 0 ? [{ role: "system", content: systemParts.join("\n") }] : [],
        { role: "user", content: prompt }
      ]
    },
    stream: false,
    credentials: credentials || { connectionId: "noauth" },
    signal: null,
    log
  });
  const upstreamResponse = response instanceof Response ? response : response.response;
  if (!upstreamResponse.ok) {
    return {
      success: false,
      status: upstreamResponse.status || 502,
      error: await upstreamResponse.text().catch(() => "Video provider error")
    };
  }
  const payload = await upstreamResponse.json().catch(() => null);
  const item = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!payload || !Array.isArray(payload.data) || payload.data.length !== 1 || !item || typeof item.b64_json !== "string" || item.b64_json.trim().length === 0 || item.format !== "mp4" || typeof item.url === "string") {
    return {
      success: false,
      status: 502,
      error: {
        error: {
          message: "Veo AI Free did not return a valid MP4 artifact",
          type: "upstream_error",
          code: "VIDEO_ARTIFACT_UNAVAILABLE"
        }
      }
    };
  }
  return {
    success: true,
    data: payload
  };
}
async function handleComfyUIVideoGeneration({ model, provider, providerConfig, body, log }) {
  const startTime = Date.now();
  const [width, height] = (body.size || "512x512").split("x").map(Number);
  const frames = body.frames || 16;
  const workflow = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: model }
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: body.prompt, clip: ["1", 1] }
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: body.negative_prompt || "", clip: ["1", 1] }
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: width || 512, height: height || 512, batch_size: frames }
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: body.steps || 20,
        cfg: body.cfg_scale || 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0]
      }
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] }
    },
    "7": {
      class_type: "SaveAnimatedWEBP",
      inputs: {
        filename_prefix: "omniroute_video",
        fps: body.fps || 8,
        lossless: false,
        quality: 80,
        method: "default",
        images: ["6", 0]
      }
    }
  };
  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info(
      "VIDEO",
      `${provider}/${model} (comfyui) | prompt: "${promptPreview}..." | frames: ${frames}`
    );
  }
  try {
    const promptId = await submitComfyWorkflow(providerConfig.baseUrl, workflow);
    const historyEntry = await pollComfyResult(providerConfig.baseUrl, promptId, 3e5);
    const outputFiles = extractComfyOutputFiles(historyEntry);
    const videos = [];
    for (const file of outputFiles) {
      const buffer = await fetchComfyOutput(
        providerConfig.baseUrl,
        file.filename,
        file.subfolder,
        file.type
      );
      const base64 = Buffer.from(buffer).toString("base64");
      videos.push({ b64_json: base64, format: "webp" });
    }
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 200,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      responseBody: { videos_count: videos.length }
    }).catch(() => {
    });
    return {
      success: true,
      data: { created: Math.floor(Date.now() / 1e3), data: videos }
    };
  } catch (err) {
    if (log) log.error("VIDEO", `${provider} comfyui error: ${err.message}`);
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 502,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: err.message
    }).catch(() => {
    });
    return {
      success: false,
      status: 502,
      error: sanitizeErrorMessage(err) || "Video provider error"
    };
  }
}
async function handleSDWebUIVideoGeneration({ model, provider, providerConfig, body, log }) {
  const startTime = Date.now();
  const [width, height] = (body.size || "512x512").split("x").map(Number);
  const url = `${providerConfig.baseUrl}/animatediff/v1/generate`;
  const upstreamBody = {
    prompt: body.prompt,
    negative_prompt: body.negative_prompt || "",
    width: width || 512,
    height: height || 512,
    steps: body.steps || 20,
    cfg_scale: body.cfg_scale || 7,
    frames: body.frames || 16,
    fps: body.fps || 8
  };
  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info("VIDEO", `${provider}/${model} (sdwebui) | prompt: "${promptPreview}..."`);
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamBody)
    });
    if (!response.ok) {
      const errorText = await response.text();
      if (log)
        log.error("VIDEO", `${provider} error ${response.status}: ${errorText.slice(0, 200)}`);
      saveCallLog({
        method: "POST",
        path: "/v1/videos/generations",
        status: response.status,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: errorText.slice(0, 500)
      }).catch(() => {
      });
      return { success: false, status: response.status, error: errorText };
    }
    const data = await response.json();
    const videos = [];
    if (data.video) {
      videos.push({ b64_json: data.video, format: "mp4" });
    } else if (data.images) {
      for (const img of data.images) {
        videos.push({ b64_json: typeof img === "string" ? img : img.image, format: "mp4" });
      }
    }
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 200,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      responseBody: { videos_count: videos.length }
    }).catch(() => {
    });
    return {
      success: true,
      data: { created: Math.floor(Date.now() / 1e3), data: videos }
    };
  } catch (err) {
    if (log) log.error("VIDEO", `${provider} sdwebui error: ${err.message}`);
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 502,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: err.message
    }).catch(() => {
    });
    return {
      success: false,
      status: 502,
      error: sanitizeErrorMessage(err) || "Video provider error"
    };
  }
}
function normalizeKieVideoResult(recordData) {
  const record = isJsonObject(recordData) ? recordData : {};
  const data = isJsonObject(record.data) ? record.data : {};
  const response = isJsonObject(data.response) ? data.response : {};
  const resultJson = parseKieResultJson(recordData);
  const urls = Array.isArray(resultJson?.resultUrls) ? resultJson.resultUrls : Array.isArray(resultJson?.videoUrls) ? resultJson.videoUrls : Array.isArray(response.resultUrls) ? response.resultUrls : [];
  return urls.filter((url) => typeof url === "string" && url.length > 0);
}
async function handleKieVideoGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log
}) {
  const startTime = Date.now();
  const timeoutMs = Number(body.timeout_ms) > 0 ? Number(body.timeout_ms) : 3e5;
  const pollIntervalMs = Number(body.poll_interval_ms) > 0 ? Number(body.poll_interval_ms) : 2500;
  const token = credentials?.apiKey || credentials?.accessToken;
  const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
  const prompt = typeof body.prompt === "string" ? body.prompt : String(body.prompt ?? "");
  if (!token) {
    return { success: false, status: 401, error: "KIE API key is required" };
  }
  const payload = {
    model,
    input: {
      prompt,
      duration: body.duration ? String(body.duration) : "5",
      aspect_ratio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : "16:9",
      sound: body.sound === true
    }
  };
  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info("VIDEO", `${provider}/${model} (kie-video) | prompt: "${promptPreview}..."`);
  }
  try {
    const createData = await kieExecutor.createTask({ baseUrl, token, payload });
    const taskId = getKieTaskId(createData);
    if (!taskId) {
      const errorMessage2 = createData?.msg || createData?.message || createData?.error || "KIE video generation did not return taskId";
      if (log) {
        log.error("VIDEO", `KIE createTask failed: ${JSON.stringify(createData)}`);
      }
      return { success: false, status: 502, error: errorMessage2 };
    }
    const statusUrl = providerConfig.statusUrl || `${baseUrl}/api/v1/jobs/recordInfo`;
    const { data: recordData, state } = await kieExecutor.pollTask({
      statusUrl,
      taskId: String(taskId),
      token,
      timeoutMs,
      pollIntervalMs
    });
    if (state === "success") {
      const videoUrls = normalizeKieVideoResult(recordData);
      const videos = videoUrls.map((url) => ({ url, format: "mp4" }));
      saveCallLog({
        method: "POST",
        path: "/v1/videos/generations",
        status: 200,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        responseBody: { videos_count: videos.length }
      }).catch(() => {
      });
      return {
        success: true,
        data: { created: Math.floor(Date.now() / 1e3), data: videos }
      };
    }
    const record = isJsonObject(recordData) ? recordData : {};
    const data = isJsonObject(record.data) ? record.data : {};
    const errorMessage = data.failMsg || data.errorMessage || record.msg || "KIE video task failed";
    return { success: false, status: 502, error: String(errorMessage) };
  } catch (err) {
    return {
      success: false,
      status: isJsonObject(err) && Number.isFinite(Number(err.status)) ? Number(err.status) : 502,
      error: sanitizeErrorMessage(err) || "Video provider error"
    };
  }
}
async function handleRunwayVideoGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log
}) {
  const startTime = Date.now();
  const token = credentials?.apiKey || credentials?.accessToken;
  if (!token) {
    return { success: false, status: 400, error: "No credentials for Runway provider" };
  }
  const promptImage = resolveRunwayPromptImage(body);
  const useImageToVideo = Boolean(promptImage);
  if (!useImageToVideo && RUNWAYML_IMAGE_REQUIRED_MODELS.has(model)) {
    return {
      success: false,
      status: 400,
      error: `Runway model ${model} requires promptImage for image-to-video generation`
    };
  }
  const ratio = resolveRunwayRatio(body);
  const duration = resolveRunwayDuration(body);
  const timeoutMs = resolvePositiveInteger(body.timeout_ms, 3e5);
  const pollIntervalMs = resolvePositiveInteger(body.poll_interval_ms, 5e3);
  const submitUrl = buildRunwayApiUrl(
    useImageToVideo ? "/image_to_video" : "/text_to_video",
    providerConfig.baseUrl
  );
  const headers = buildRunwayHeaders(token);
  const upstreamBody = {
    model,
    promptText: body.prompt,
    ratio,
    duration
  };
  if (useImageToVideo) upstreamBody.promptImage = promptImage;
  if (typeof body.seed === "number" && Number.isFinite(body.seed)) {
    upstreamBody.seed = Math.max(0, Math.floor(body.seed));
  }
  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info(
      "VIDEO",
      `${provider}/${model} (runway ${useImageToVideo ? "image_to_video" : "text_to_video"}) | prompt: "${promptPreview}..."`
    );
  }
  try {
    const submitResponse = await fetch(submitUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody)
    });
    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      if (log) {
        log.error(
          "VIDEO",
          `${provider} submit error ${submitResponse.status}: ${errorText.slice(0, 200)}`
        );
      }
      saveCallLog({
        method: "POST",
        path: "/v1/videos/generations",
        status: submitResponse.status,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: errorText.slice(0, 500)
      }).catch(() => {
      });
      return { success: false, status: submitResponse.status, error: errorText };
    }
    const submitData = await submitResponse.json();
    const taskId = typeof submitData?.id === "string" ? submitData.id : "";
    if (!taskId) {
      const errorText = `Runway submit did not return task id: ${JSON.stringify(submitData).slice(0, 400)}`;
      saveCallLog({
        method: "POST",
        path: "/v1/videos/generations",
        status: 502,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: errorText
      }).catch(() => {
      });
      return { success: false, status: 502, error: errorText };
    }
    const deadline = Date.now() + timeoutMs;
    let lastTask = null;
    while (Date.now() < deadline) {
      const taskResponse = await fetch(
        buildRunwayApiUrl(`/tasks/${encodeURIComponent(taskId)}`, providerConfig.baseUrl),
        {
          method: "GET",
          headers
        }
      );
      if (!taskResponse.ok) {
        const errorText = await taskResponse.text();
        if (log) {
          log.error(
            "VIDEO",
            `${provider} poll error ${taskResponse.status}: ${errorText.slice(0, 200)}`
          );
        }
        saveCallLog({
          method: "POST",
          path: "/v1/videos/generations",
          status: taskResponse.status,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime,
          error: errorText.slice(0, 500),
          responseBody: { taskId, stage: "poll" }
        }).catch(() => {
        });
        return { success: false, status: taskResponse.status, error: errorText };
      }
      const task = await taskResponse.json();
      lastTask = task;
      const status = String(task?.status || "").toUpperCase();
      if (status === "SUCCEEDED") {
        const videos = await normalizeRunwayVideoResult(task, body);
        saveCallLog({
          method: "POST",
          path: "/v1/videos/generations",
          status: 200,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime,
          responseBody: { videos_count: videos.length, taskId, mode: "async" }
        }).catch(() => {
        });
        return {
          success: true,
          data: { created: Math.floor(Date.now() / 1e3), data: videos }
        };
      }
      if (RUNWAY_TERMINAL_FAILURE_STATUSES.has(status)) {
        const errorText = extractRunwayFailureMessage(task) || `Runway task failed with status ${status}`;
        saveCallLog({
          method: "POST",
          path: "/v1/videos/generations",
          status: 502,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime,
          error: errorText.slice(0, 500),
          responseBody: { taskId, status }
        }).catch(() => {
        });
        return { success: false, status: 502, error: errorText };
      }
      await sleep(pollIntervalMs);
    }
    const timeoutError = `Runway task timeout after ${timeoutMs}ms (taskId=${taskId}, status=${String(
      lastTask?.status || "unknown"
    )})`;
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 504,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: timeoutError,
      responseBody: { taskId, status: lastTask?.status ?? null }
    }).catch(() => {
    });
    return { success: false, status: 504, error: timeoutError };
  } catch (err) {
    if (log) log.error("VIDEO", `${provider} runway error: ${err.message}`);
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 502,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: err.message
    }).catch(() => {
    });
    return {
      success: false,
      status: 502,
      error: sanitizeErrorMessage(err) || "Video provider error"
    };
  }
}
const RUNWAY_TERMINAL_FAILURE_STATUSES = /* @__PURE__ */ new Set([
  "FAILED",
  "CANCELED",
  "CANCELLED",
  "ABORTED",
  "DELETED"
]);
async function handleHaiperVideoGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log
}) {
  const startTime = Date.now();
  const token = credentials?.apiKey || "";
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", HAIPER_KEY: token },
    body: JSON.stringify({ prompt: body.prompt, duration: 4, aspect_ratio: "16:9" })
  });
  if (!res.ok) {
    const errorText = await res.text();
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: res.status,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: errorText.slice(0, 500)
    }).catch(() => {
    });
    return { success: false, status: res.status, error: errorText };
  }
  const { job_id } = await res.json();
  const deadline = Date.now() + 3e5;
  while (Date.now() < deadline) {
    await sleep(5e3);
    const statusRes = await fetch(`${providerConfig.statusUrl}/${job_id}`, {
      headers: { HAIPER_KEY: token }
    });
    const status = await statusRes.json();
    if (status.status === "completed" || status.status === "succeeded") {
      const videoUrl = status.creation_url || status.output?.video_url;
      if (videoUrl) {
        const videoRes = await fetch(videoUrl);
        const buf = await videoRes.arrayBuffer();
        saveCallLog({
          method: "POST",
          path: "/v1/videos/generations",
          status: 200,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime
        }).catch(() => {
        });
        return {
          success: true,
          data: {
            created: Math.floor(Date.now() / 1e3),
            data: [{ b64_json: Buffer.from(buf).toString("base64"), format: "mp4" }]
          }
        };
      }
    }
    if (status.status === "failed") {
      saveCallLog({
        method: "POST",
        path: "/v1/videos/generations",
        status: 502,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: "Haiper video generation failed"
      }).catch(() => {
      });
      return { success: false, status: 502, error: "Haiper video generation failed" };
    }
  }
  saveCallLog({
    method: "POST",
    path: "/v1/videos/generations",
    status: 504,
    model: `${provider}/${model}`,
    provider,
    duration: Date.now() - startTime,
    error: "Haiper video generation timed out"
  }).catch(() => {
  });
  return { success: false, status: 504, error: "Haiper video generation timed out" };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export {
  handleVideoGeneration,
  resolveVideoBaseUrl
};
