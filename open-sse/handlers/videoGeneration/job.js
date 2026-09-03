import {
  fetchWithTimeout,
  FetchTimeoutError,
  getConfiguredTimeout
} from "../../utils/omni/fetchTimeout.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import { sleep } from "../../utils/omni/sleep.js";
function readPath(value, path) {
  if (!path) return value;
  let current = value;
  for (const segment of path.split(".")) {
    if (current === null || current === void 0) return void 0;
    if (typeof current !== "object") return void 0;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return void 0;
      current = current[index];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return void 0;
    current = current[segment];
  }
  return current;
}
function readStringPath(value, path) {
  const found = readPath(value, path);
  return typeof found === "string" && found.trim() ? found : null;
}
function isDoneStatus(status, done, failed) {
  if (typeof status !== "string") return "pending";
  if (failed.includes(status)) return "failed";
  if (done.includes(status)) return "done";
  return "pending";
}
const VIDEO_JOB_PRESETS = {
  "agnes-video-job": {
    id: "agnes-video-job",
    displayName: "Agnes Video V2.0",
    authHeaderName: "Authorization",
    authScheme: "bearer",
    // Official Agnes flow: POST /v1/videos returns video_id, then the recommended
    // status endpoint GET /agnesapi?video_id=… exposes status and metadata.url.
    baseUrlFallback: "https://apihub.agnes-ai.com",
    submit: {
      method: "POST",
      path: "/v1/videos",
      buildBody: ({ model, prompt, extras }) => ({
        model,
        prompt,
        // passthrough of image/mode/num_frames/frame_rate/…  — the generic
        // route body uses .catchall, so provider-specific knobs survive.
        ...extras
      })
    },
    taskIdPath: "video_id",
    poll: { pathTemplate: "/agnesapi?video_id={taskId}" },
    statusPath: "status",
    statusDone: ["completed"],
    statusFailed: ["failed"],
    resultPath: "metadata.url",
    maxPolls: 60,
    pollIntervalMs: 2e3
  },
  "muapi-video-job": {
    id: "muapi-video-job",
    displayName: "muapi.ai",
    authHeaderName: "x-api-key",
    authScheme: "raw",
    // muapi.ai video/audio surface is Replicate-style: POST /api/v1/{model}
    // returns { request_id }; poll GET /api/v1/predictions/{id}/result.
    baseUrlFallback: "https://api.muapi.ai",
    submit: {
      method: "POST",
      path: "/api/v1/{model}",
      buildBody: (params) => {
        const { prompt, duration, extras } = params;
        return {
          prompt,
          ...typeof duration === "number" ? { duration } : {},
          ...extras
        };
      }
    },
    taskIdPath: "request_id",
    poll: { pathTemplate: "/api/v1/predictions/{taskId}/result" },
    statusPath: "status",
    statusDone: ["completed"],
    statusFailed: ["failed"],
    resultPath: "outputs",
    maxPolls: 60,
    pollIntervalMs: 2e3
  },
  "sora-job": {
    id: "sora-job",
    displayName: "OpenAI Sora",
    authHeaderName: "Authorization",
    authScheme: "bearer",
    baseUrlFallback: "https://api.openai.com",
    submit: {
      method: "POST",
      path: "/v1/videos",
      buildBody: (params) => {
        const { model, prompt, duration, extras } = params;
        return {
          model,
          prompt,
          ...typeof duration === "number" ? { seconds: String(duration) } : {},
          ...extras
        };
      }
    },
    taskIdPath: "id",
    poll: { pathTemplate: "/v1/videos/{taskId}" },
    statusPath: "status",
    statusDone: ["completed"],
    statusFailed: ["failed"],
    resultPath: "data",
    maxPolls: 60,
    pollIntervalMs: 2e3
  }
};
function getVideoJobPreset(presetName) {
  if (typeof presetName !== "string") return null;
  const preset = VIDEO_JOB_PRESETS[presetName];
  return preset ?? null;
}
async function handleVideoJobGeneration({
  model,
  presetName,
  body,
  credentials,
  log,
  maxPolls: maxPollsOverride,
  pollIntervalMs: pollIntervalOverride
}) {
  const preset = getVideoJobPreset(presetName);
  if (!preset) {
    return {
      success: false,
      status: 400,
      error: `Unknown video job preset: ${presetName}`
    };
  }
  const baseUrl = resolveJobBaseUrl(credentials, preset.baseUrlFallback);
  log?.info?.("VIDEO", `Job preset ${presetName} submitting ${model}`);
  log?.info?.("VIDEO", JSON.stringify({ baseUrl }));
  const bodyForPreset = preset.submit.buildBody({
    model,
    prompt: typeof body.prompt === "string" ? body.prompt : void 0,
    duration: typeof body.duration === "number" ? body.duration : void 0,
    // passthrough of the remainder — the API keeps catchall extras
    extras: Object.fromEntries(
      Object.entries(body ?? {}).filter(
        ([key]) => key !== "model" && key !== "prompt" && key !== "duration"
      )
    )
  });
  const submitPath = preset.submit.path.replace("{model}", encodeURIComponent(model));
  const submitUrl = `${baseUrl}${submitPath}`;
  const submitResult = await fetchJson(submitUrl, {
    method: preset.submit.method,
    headers: buildJobHeaders(preset, credentials),
    body: JSON.stringify(bodyForPreset),
    log
  });
  if (submitResult.ok === false) {
    return { success: false, status: submitResult.status, error: submitResult.error };
  }
  const taskId = readStringPath(submitResult.data, preset.taskIdPath);
  if (!taskId) {
    return {
      success: false,
      status: 502,
      error: `Video provider did not return a job id (${presetName})`
    };
  }
  const maxPolls = maxPollsOverride ?? preset.maxPolls;
  const pollInterval = pollIntervalOverride ?? preset.pollIntervalMs;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    await sleep(pollInterval);
    const pollUrl = `${baseUrl}${preset.poll.pathTemplate.replace("{taskId}", encodeURIComponent(taskId))}`;
    const pollResult = await fetchJson(pollUrl, {
      method: "GET",
      headers: buildJobHeaders(preset, credentials),
      log
    });
    if (pollResult.ok === false) {
      return { success: false, status: pollResult.status, error: pollResult.error };
    }
    const status = readPath(pollResult.data, preset.statusPath);
    const jobState = isDoneStatus(status, preset.statusDone, preset.statusFailed);
    if (jobState === "done") {
      const url = readResultUrl(pollResult.data, preset.resultPath);
      if (!url) {
        return {
          success: false,
          status: 502,
          error: `Video job completed but no result URL found (${presetName})`
        };
      }
      log?.info?.("VIDEO", `Job completed after ${attempt} poll(s)`);
      return {
        success: true,
        data: {
          created: Math.floor(Date.now() / 1e3),
          data: [{ url, format: "mp4" }]
        }
      };
    }
    if (jobState === "failed") {
      return {
        success: false,
        status: 502,
        error: `Video job failed (${presetName})`
      };
    }
  }
  return {
    success: false,
    status: 504,
    error: `Video job timed out after ${maxPolls} polls (${presetName})`
  };
}
function buildJobHeaders(preset, credentials) {
  const creds = credentials;
  const apiKey = typeof creds?.apiKey === "string" && creds.apiKey ? creds.apiKey : typeof creds?.accessToken === "string" && creds.accessToken ? creds.accessToken : "";
  const headers = { "Content-Type": "application/json" };
  if (!apiKey) return headers;
  if (preset.authScheme === "raw") {
    headers[preset.authHeaderName] = apiKey;
  } else {
    headers[preset.authHeaderName] = `Bearer ${apiKey}`;
  }
  return headers;
}
function resolveJobBaseUrl(credentials, fallback) {
  const creds = credentials;
  const psdBaseUrl = creds?.providerSpecificData?.baseUrl != null && typeof creds.providerSpecificData.baseUrl === "string" && creds.providerSpecificData.baseUrl.trim() ? creds.providerSpecificData.baseUrl.trim() : null;
  const topLevelBaseUrl = creds?.baseUrl != null && typeof creds.baseUrl === "string" && creds.baseUrl.trim() ? creds.baseUrl.trim() : null;
  const nodeBaseUrl = psdBaseUrl || topLevelBaseUrl;
  if (!nodeBaseUrl) return fallback.replace(/\/+$/, "");
  let normalized = nodeBaseUrl;
  while (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}
async function fetchJson(url, {
  method,
  headers,
  body,
  log
}) {
  try {
    const response = await fetchWithTimeout(url, {
      method,
      headers,
      ...body !== void 0 ? { body } : {},
      timeoutMs: getConfiguredTimeout()
    });
    if (!response.ok) {
      const errorText = await response.text();
      log?.error?.("VIDEO", `Upstream ${response.status} for ${url}: ${errorText.slice(0, 200)}`);
      return { ok: false, status: response.status, error: errorText };
    }
    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof FetchTimeoutError || err instanceof Error && err.name === "AbortError";
    log?.error?.(
      "VIDEO",
      `${isTimeout ? "Timeout" : "Request error"} for ${url}: ${sanitizeErrorMessage(message)}`
    );
    return {
      ok: false,
      status: isTimeout ? 504 : 502,
      error: `Video provider error: ${sanitizeErrorMessage(message)}`
    };
  }
}
function readResultUrl(data, resultPath) {
  const found = readPath(data, resultPath);
  if (typeof found === "string" && found.trim()) return found.trim();
  if (Array.isArray(found)) {
    const first = found[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const urlEntry = first.url;
      if (typeof urlEntry === "string" && urlEntry.trim()) return urlEntry.trim();
    }
    return null;
  }
  return null;
}
export {
  getVideoJobPreset,
  handleVideoJobGeneration
};
