import { AdaptiveAdmissionController } from "./controller.js";
import { validateConfig } from "./config.js";
import { extractAdmissionCostFeatures } from "./requestFeatures.js";
import { buildErrorBody } from "../../utils/errorSanitize.js";
import { CORS_HEADERS } from "../../utils/cors.js";
import {
  checkResourcePressureGuard,
  getResourcePressureObservation
} from "../../utils/resourcePressure.js";
import { extractAdmissionCostFeatures as extractAdmissionCostFeatures2 } from "./requestFeatures.js";
import { log as engineLog } from "../../utils/log.js";
const DEFAULT_ADAPTIVE_ADMISSION_CONFIG = Object.freeze({
  mode: "shadow",
  minLimit: 8,
  initialLimit: 64,
  maxLimit: 1e3,
  maxQueueCount: 128,
  maxQueueCost: 2e3,
  defaultMaxWaitMs: 5e3,
  windowMs: 1e3,
  virtualLanes: false
});
const RUNTIME_STORE_KEY = Symbol.for("omniroute.adaptiveAdmission.runtime");
function getRuntimeStore() {
  const globalWithStore = globalThis;
  let store = globalWithStore[RUNTIME_STORE_KEY];
  if (!store) {
    store = { runtime: null };
    globalWithStore[RUNTIME_STORE_KEY] = store;
  }
  return store;
}
const ENV_KEYS = {
  mode: "ADAPTIVE_ADMISSION_MODE",
  minLimit: "ADAPTIVE_ADMISSION_MIN_LIMIT",
  initialLimit: "ADAPTIVE_ADMISSION_INITIAL_LIMIT",
  maxLimit: "ADAPTIVE_ADMISSION_MAX_LIMIT",
  maxQueueCount: "ADAPTIVE_ADMISSION_MAX_QUEUE_COUNT",
  maxQueueCost: "ADAPTIVE_ADMISSION_MAX_QUEUE_COST",
  defaultMaxWaitMs: "ADAPTIVE_ADMISSION_MAX_WAIT_MS",
  windowMs: "ADAPTIVE_ADMISSION_WINDOW_MS"
};
function parsePositiveSafeInt(name, raw) {
  if (!/^[0-9]+$/.test(raw)) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}
function resolveAdaptiveAdmissionConfigFromEnv(env = process.env) {
  const cfg = { ...DEFAULT_ADAPTIVE_ADMISSION_CONFIG };
  const modeRaw = env[ENV_KEYS.mode];
  if (modeRaw !== void 0 && modeRaw !== "") {
    if (modeRaw !== "off" && modeRaw !== "shadow" && modeRaw !== "enforce") {
      throw new RangeError(`${ENV_KEYS.mode} must be off|shadow|enforce`);
    }
    cfg.mode = modeRaw;
  }
  const intFields = [
    "minLimit",
    "initialLimit",
    "maxLimit",
    "maxQueueCount",
    "maxQueueCost",
    "defaultMaxWaitMs",
    "windowMs"
  ];
  for (const field of intFields) {
    const envName = ENV_KEYS[field];
    const raw = env[envName];
    if (raw === void 0 || raw === "") continue;
    cfg[field] = parsePositiveSafeInt(envName, raw);
  }
  validateConfig(cfg);
  const vlRaw = env.OMNIROUTE_CHAT_VIRTUAL_LANES;
  cfg.virtualLanes = vlRaw === "1" || vlRaw === "true";
  return cfg;
}
const REJECT_MAP = {
  ADMISSION_ABORTED: {
    status: 499,
    code: "admission_aborted",
    message: "Request aborted"
  },
  ADMISSION_OVERSIZED: {
    status: 503,
    code: "admission_oversized",
    message: "Request too large for current capacity"
  },
  ADMISSION_QUEUE_FULL: {
    status: 503,
    code: "admission_queue_full",
    message: "Service temporarily unavailable",
    retryAfter: "1"
  },
  ADMISSION_DEADLINE: {
    status: 503,
    code: "admission_deadline",
    message: "Service temporarily unavailable",
    retryAfter: "1"
  },
  ADMISSION_SHUTDOWN: {
    status: 503,
    code: "admission_shutdown",
    message: "Service temporarily unavailable"
  },
  ADMISSION_UNAVAILABLE: {
    status: 503,
    code: "admission_unavailable",
    message: "Service temporarily unavailable",
    retryAfter: "1"
  },
  ADMISSION_LANE_EVICTED: {
    status: 503,
    code: "admission_lane_evicted",
    message: "Connection lane evicted",
    retryAfter: "1"
  }
};
function isAdmissionRejectError(err) {
  return !!err && typeof err === "object" && err.name === "AdmissionRejectError" && typeof err.code === "string";
}
function buildAdmissionRejectResponse(code) {
  const mapping = REJECT_MAP[code] ?? REJECT_MAP.ADMISSION_UNAVAILABLE;
  const headers = {
    "Content-Type": "application/json",
    ...CORS_HEADERS
  };
  if (mapping.retryAfter) headers["Retry-After"] = mapping.retryAfter;
  const body = buildErrorBody(mapping.status, mapping.message, void 0, {
    type: mapping.status === 499 ? "client_disconnected" : "server_error",
    code: mapping.code
  });
  return {
    status: "rejected",
    code: mapping.code,
    response: new Response(JSON.stringify(body), {
      status: mapping.status,
      headers
    })
  };
}
function observationIdentity(state) {
  return `${state.observedAtMs}|${state.severity}|${state.reason}`;
}
function toAdmissionPressure(severity) {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  return "normal";
}
function isSseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("text/event-stream");
}
function releaseOnce(lease, outcome, admittedAtMs, nowMs) {
  if (lease.released) return;
  const latencyMs = admittedAtMs === void 0 ? void 0 : Math.max(0, nowMs() - admittedAtMs);
  lease.release(outcome, latencyMs === void 0 ? void 0 : { latencyMs });
}
function classifyHttpOutcome(status, signal) {
  if (signal?.aborted || status === 499) return "cancelled";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "upstream_error";
  if (status >= 400) return "local_reject";
  return "success";
}
class AdaptiveAdmissionRuntimeImpl {
  controller;
  checkResourcePressure;
  getResourcePressureObservation;
  onPressureObserved;
  nowMs;
  lastObservationKey = null;
  lastResource = { severity: "normal", reason: "none", observedAtMs: 0 };
  pressureGuardRejectCount = 0;
  disposed = false;
  constructor(options, config) {
    this.controller = new AdaptiveAdmissionController(config, options.clock);
    this.checkResourcePressure = options.checkResourcePressure ?? checkResourcePressureGuard;
    this.getResourcePressureObservation = options.getResourcePressureObservation ?? getResourcePressureObservation;
    this.onPressureObserved = options.onPressureObserved;
    this.nowMs = options.nowMs ?? options.clock?.now ?? (() => Date.now());
  }
  async acquire(input) {
    if (this.disposed) {
      return buildAdmissionRejectResponse("ADMISSION_SHUTDOWN");
    }
    let guard = null;
    try {
      guard = this.checkResourcePressure();
    } catch {
    }
    this.feedFreshPressureObservation();
    if (guard) {
      this.pressureGuardRejectCount += 1;
      return {
        status: "rejected",
        code: "resource_pressure",
        response: guard.response
      };
    }
    const features = extractAdmissionCostFeatures(
      input.body,
      input.streaming === void 0 ? void 0 : { streaming: input.streaming }
    );
    let result;
    try {
      result = await this.controller.acquire({
        tenantKey: input.tenantKey,
        features,
        signal: input.signal,
        maxWaitMs: input.maxWaitMs
      });
    } catch (err) {
      if (isAdmissionRejectError(err)) {
        return buildAdmissionRejectResponse(err.code);
      }
      return buildAdmissionRejectResponse("ADMISSION_UNAVAILABLE");
    }
    if (result.status === "rejected") {
      return buildAdmissionRejectResponse(result.code);
    }
    if (result.status === "queued") {
      try {
        const admitted = await result.promise;
        return {
          status: "admitted",
          mode: this.controller.snapshot().mode,
          lease: admitted.lease,
          admittedAtMs: this.nowMs(),
          shadowDecision: admitted.shadowDecision
        };
      } catch (err) {
        if (isAdmissionRejectError(err)) {
          return buildAdmissionRejectResponse(err.code);
        }
        return buildAdmissionRejectResponse("ADMISSION_UNAVAILABLE");
      }
    }
    return {
      status: "admitted",
      mode: this.controller.snapshot().mode,
      lease: result.lease,
      admittedAtMs: this.nowMs(),
      shadowDecision: result.shadowDecision
    };
  }
  snapshot() {
    const core = this.controller.snapshot();
    return {
      ...core,
      resourceSeverity: this.lastResource.severity,
      resourceReason: this.lastResource.reason,
      resourceObservedAtMs: this.lastResource.observedAtMs,
      pressureGuardRejectCount: this.pressureGuardRejectCount
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.shutdown();
  }
  releaseHandlerFailure(lease, outcome, options) {
    releaseOnce(lease, outcome, options?.admittedAtMs, options?.nowMs ?? this.nowMs);
  }
  attachResponseLifecycle(response, lease, options) {
    const nowMs = options.nowMs ?? this.nowMs;
    const admittedAtMs = options.admittedAtMs;
    if (!response.body || !isSseResponse(response)) {
      releaseOnce(lease, classifyHttpOutcome(response.status, options.signal), admittedAtMs, nowMs);
      return response;
    }
    const upstream = response.body;
    const reader = upstream.getReader();
    let settled = false;
    let readerCancelled = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      releaseOnce(lease, outcome, admittedAtMs, nowMs);
    };
    const cancelReader = (reason) => {
      if (readerCancelled) return;
      readerCancelled = true;
      void reader.cancel(reason).catch(() => {
      });
    };
    const onAbort = () => {
      cancelReader(options.signal?.reason);
      settle("cancelled");
    };
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }
    const detachAbort = () => {
      options.signal?.removeEventListener("abort", onAbort);
    };
    const stream = new ReadableStream({
      async pull(controller) {
        if (settled) {
          controller.close();
          return;
        }
        try {
          const { done, value } = await reader.read();
          if (done) {
            detachAbort();
            settle(classifyHttpOutcome(response.status, options.signal));
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (err) {
          detachAbort();
          settle(options.signal?.aborted ? "cancelled" : "upstream_error");
          controller.error(err);
        }
      },
      cancel(reason) {
        detachAbort();
        cancelReader(reason);
        settle("cancelled");
      }
    });
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
  feedFreshPressureObservation() {
    try {
      const observation = this.getResourcePressureObservation();
      const state = observation.state;
      this.lastResource = {
        severity: state.severity,
        reason: state.reason,
        observedAtMs: state.observedAtMs
      };
      const key = observationIdentity(state);
      if (state.observedAtMs <= 0) return;
      if (key === this.lastObservationKey) return;
      this.lastObservationKey = key;
      const pressure = toAdmissionPressure(state.severity);
      this.controller.observePressure(pressure);
      this.onPressureObserved?.(pressure);
    } catch {
    }
  }
}
function createRuntimeFromResolvedConfig(options, config) {
  return new AdaptiveAdmissionRuntimeImpl(options, config);
}
function createAdaptiveAdmissionRuntime(options = {}) {
  const config = options.config ?? (options.env ? resolveAdaptiveAdmissionConfigFromEnv(options.env) : { ...DEFAULT_ADAPTIVE_ADMISSION_CONFIG });
  return createRuntimeFromResolvedConfig(options, config);
}
function warnInvalidDefaultConfig(warn) {
  const message = "[adaptiveAdmission] invalid environment configuration; using default shadow admission settings";
  if (warn) {
    warn(message);
    return;
  }
  engineLog.warn("ADMISSION", message);
}
function createDefaultProcessRuntime(options = {}) {
  const warn = options.warn;
  try {
    const config = options.config ?? resolveAdaptiveAdmissionConfigFromEnv(options.env ?? process.env);
    return createRuntimeFromResolvedConfig(options, config);
  } catch {
    warnInvalidDefaultConfig(warn);
    return createRuntimeFromResolvedConfig(options, {
      ...DEFAULT_ADAPTIVE_ADMISSION_CONFIG
    });
  }
}
function getAdaptiveAdmissionRuntime() {
  const store = getRuntimeStore();
  if (!store.runtime) {
    store.runtime = createDefaultProcessRuntime();
  }
  return store.runtime;
}
function reloadAdaptiveAdmissionRuntime(options = {}) {
  const store = getRuntimeStore();
  store.runtime?.dispose();
  store.runtime = createDefaultProcessRuntime(options);
  return store.runtime;
}
function resetAdaptiveAdmissionRuntimeForTests() {
  const store = getRuntimeStore();
  store.runtime?.dispose();
  store.runtime = null;
}
export {
  DEFAULT_ADAPTIVE_ADMISSION_CONFIG,
  createAdaptiveAdmissionRuntime,
  extractAdmissionCostFeatures2 as extractAdmissionCostFeatures,
  getAdaptiveAdmissionRuntime,
  reloadAdaptiveAdmissionRuntime,
  resetAdaptiveAdmissionRuntimeForTests,
  resolveAdaptiveAdmissionConfigFromEnv
};
