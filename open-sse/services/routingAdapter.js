// routingAdapter.js
//
// Clean adapter over the ported OmniRoute admission + routing services
// (open-sse/services/admission/* and open-sse/services/routing/*, plus the
// standalone evalRouting.js / taskAwareRouting.js / webSearchRouting.js).
//
// The ported services are standalone and not yet consumed by the engine, so this
// adapter exposes a small, stable surface:
//
//   checkAdmission(reqCtx)  -> Promise<{ allowed: true }>
//                              | Promise<{ allowed: false, reason, status }>
//   selectRoute(ctx)        -> Promise<route object | null>
//   getRoutingConfig()      -> ported config snapshot (sync, cached)
//
// Degradation policy: every ported module is imported lazily and every call is
// wrapped in try/catch. If anything fails, checkAdmission degrades to
// { allowed: true } (never blocks routing) and selectRoute degrades to null
// (caller falls back to its own routing).

// ---------------------------------------------------------------------------
// Lazy module handles (populated on first use; never top-level imported).
// ---------------------------------------------------------------------------
let _admissionModule = null;
let _admissionRuntimeModule = null;
let _routingModule = null;
let _taskAwareModule = null;
let _evalRoutingModule = null;
let _webSearchModule = null;

// Lazily-created singleton admission controller + the config it was built from.
let _controller = null;
let _controllerConfig = null;

// Cached config snapshot returned by getRoutingConfig().
let _configCache = null;

async function loadAdmissionModule() {
  if (!_admissionModule) _admissionModule = await import("./admission/index.js");
  return _admissionModule;
}
async function loadAdmissionRuntimeModule() {
  if (!_admissionRuntimeModule) _admissionRuntimeModule = await import("./admission/runtime.js");
  return _admissionRuntimeModule;
}
async function loadRoutingModule() {
  if (!_routingModule) _routingModule = await import("./routing/index.js");
  return _routingModule;
}
async function loadTaskAwareModule() {
  if (!_taskAwareModule) _taskAwareModule = await import("./taskAwareRouting.js");
  return _taskAwareModule;
}
async function loadEvalRoutingModule() {
  if (!_evalRoutingModule) _evalRoutingModule = await import("./evalRouting.js");
  return _evalRoutingModule;
}
async function loadWebSearchModule() {
  if (!_webSearchModule) _webSearchModule = await import("./webSearchRouting.js");
  return _webSearchModule;
}

// ---------------------------------------------------------------------------
// Admission helpers
// ---------------------------------------------------------------------------

// Mirrors the reject-code -> HTTP status mapping in the ported
// admission/runtime.js REJECT_MAP (not exported there, so mirrored here).
const ADMISSION_REJECT_STATUS = {
  ADMISSION_ABORTED: 499,
  ADMISSION_OVERSIZED: 503,
  ADMISSION_QUEUE_FULL: 503,
  ADMISSION_DEADLINE: 503,
  ADMISSION_SHUTDOWN: 503,
  ADMISSION_UNAVAILABLE: 503,
  ADMISSION_LANE_EVICTED: 503
};

function rejectStatusOf(code) {
  return ADMISSION_REJECT_STATUS[code] ?? 503;
}

// Build a single lazy singleton AdaptiveAdmissionController from env-resolved
// ported config (falling back to the ported defaults when env is invalid).
function getAdmissionController(admission, runtime) {
  if (_controller) return { controller: _controller, config: _controllerConfig };
  let config;
  try {
    config = runtime.resolveAdaptiveAdmissionConfigFromEnv(process.env);
  } catch {
    config = { ...runtime.DEFAULT_ADAPTIVE_ADMISSION_CONFIG };
  }
  _controllerConfig = config;
  _controller = new admission.AdaptiveAdmissionController(config);
  return { controller: _controller, config };
}

// Translate the adapter's reqCtx into the controller's acquire() request shape.
function buildAdmissionRequest(reqCtx, runtime) {
  const request = {};
  if (reqCtx.tenantKey) request.tenantKey = reqCtx.tenantKey;
  if (reqCtx.cost != null) request.cost = reqCtx.cost;
  else if (reqCtx.features) request.features = reqCtx.features;
  else if (reqCtx.body != null) {
    request.features = runtime.extractAdmissionCostFeatures(
      reqCtx.body,
      reqCtx.streaming === void 0 ? void 0 : { streaming: reqCtx.streaming }
    );
  }
  return request;
}

// Mirror the controller's resolveCost() so the pure check uses the exact same
// cost the controller would compute (keeps prediction and acquire consistent).
function resolveCheckCost(admission, config, request) {
  if (request.cost !== void 0) {
    return admission.normalizeRequestCost(request.cost, config.maxRequestCost);
  }
  if (request.features) {
    return admission.estimateAdmissionCost(request.features, config.costConfig);
  }
  return 1;
}

/**
 * Ask whether a request may be admitted. Calls the ported admission controller
 * and maps its decision to `{ allowed: true }` or
 * `{ allowed: false, reason, status }`. This is a pure, non-destructive check:
 * it never enqueues and never holds a lease, so it can be run ahead of an
 * actual acquire without double-counting capacity.
 *
 * Degrades to `{ allowed: true }` on any error (never blocks routing).
 */
export async function checkAdmission(reqCtx = {}) {
  try {
    const admission = await loadAdmissionModule();
    const runtime = await loadAdmissionRuntimeModule();
    const { controller, config } = getAdmissionController(admission, runtime);

    // An already-aborted caller should not be admitted.
    if (reqCtx.signal && reqCtx.signal.aborted) {
      return { allowed: false, reason: "ADMISSION_ABORTED", status: 499 };
    }

    const snap = controller.snapshot();

    // "off" -> admission disabled -> always allowed.
    if (snap.mode === "off") return { allowed: true };

    // "shadow" -> observational, never rejects -> allowed.
    if (snap.mode === "shadow") return { allowed: true };

    // "enforce" -> mirror the controller's immediate acquire decision without
    // enqueueing (pure check). The decision rules match acquire():
    const request = buildAdmissionRequest(reqCtx, runtime);
    const cost = resolveCheckCost(admission, config, request);

    if (cost > snap.currentLimit) {
      // Oversized; only allowed solo when the system is otherwise idle.
      if (controller.shouldAdmitSolo(cost)) return { allowed: true };
      return { allowed: false, reason: "ADMISSION_OVERSIZED", status: 503 };
    }
    if (snap.queuedCount > 0 || snap.activeCost + cost > snap.currentLimit) {
      // Would queue (not rejected): it waits up to maxWaitMs, so it is allowed.
      return { allowed: true };
    }

    // Guaranteed immediate admit (no await happened since the snapshot, so the
    // state cannot have changed). Confirm through the controller and release
    // the lease right away so the check does not hold capacity.
    const result = await controller.acquire({ ...request, cost });
    if (result && result.status === "rejected") {
      return {
        allowed: false,
        reason: result.code || "ADMISSION_REJECTED",
        status: rejectStatusOf(result.code)
      };
    }
    if (result && result.status === "admitted") {
      try {
        if (result.lease && !result.lease.released) result.lease.release("cancelled");
      } catch {
        // releasing is best-effort for a check
      }
      return { allowed: true };
    }
    return { allowed: true };
  } catch {
    // Graceful degradation: never reject routing because the check itself failed.
    return { allowed: true };
  }
}

// ---------------------------------------------------------------------------
// Routing helpers
// ---------------------------------------------------------------------------

// Normalize candidate targets to { provider, model, modelStr } records that the
// ported task-aware / eval selectors understand.
function buildCandidateTargets(ctx) {
  const targets = ctx.targets;
  if (Array.isArray(targets)) {
    return targets
      .map((t) => {
        if (typeof t === "string") {
          return { provider: ctx.provider ?? null, model: t, modelStr: t };
        }
        if (t && typeof t === "object") {
          const model = t.model ?? t.modelStr ?? null;
          return { provider: t.provider ?? ctx.provider ?? null, model, modelStr: t.modelStr ?? model };
        }
        return null;
      })
      .filter(Boolean);
  }
  if (Array.isArray(ctx.candidates)) {
    return ctx.candidates
      .filter((m) => typeof m === "string" && m.length > 0)
      .map((m) => ({ provider: ctx.provider ?? null, model: m, modelStr: m }));
  }
  const model = ctx.model ?? null;
  return [{ provider: ctx.provider ?? null, model, modelStr: ctx.modelStr ?? model }];
}

function requiredCapabilitySet(required) {
  if (Array.isArray(required)) return new Set(required.map((c) => String(c)));
  if (required && typeof required === "object") {
    return new Set(
      Object.keys(required).filter((k) => required[k] === true)
    );
  }
  return new Set();
}

// Safely run one selector step; a failure in any step should not kill the whole
// selection (we simply keep the previous ordering).
function safeReorder(fn, targets, ...args) {
  try {
    const out = fn(targets, ...args);
    return Array.isArray(out) ? out : targets;
  } catch {
    return targets;
  }
}

const NOOP_LOG = {
  warn() {},
  info() {},
  debug() {}
};

/**
 * Pick a route using the ported routing selectors. Candidate order:
 *   1. task-aware reorder (classifyTask + reorderByTaskWeight)
 *   2. eval-history reorder (orderTargetsByEvalScores)
 *   3. web-search override (resolveWebSearchRouteOverride)
 * The top candidate becomes the returned route.
 *
 * Returns the route object, or null on any error (caller falls back).
 */
export async function selectRoute(ctx = {}) {
  try {
    const [routing, taskAware, evalRouting, webSearch] = await Promise.all([
      loadRoutingModule(),
      loadTaskAwareModule(),
      loadEvalRoutingModule(),
      loadWebSearchModule()
    ]);

    // Bootstrap the ported routing observability (idempotent; registers the
    // memory/quality/otel sinks so quality data flows for future selections).
    let routingInfo = null;
    try {
      routingInfo = routing.initRoutingObservability();
    } catch {
      routingInfo = null;
    }

    const targets = buildCandidateTargets(ctx);
    if (!targets || targets.length === 0) return null;

    const task = taskAware.classifyTask(ctx.body || {});
    const required = requiredCapabilitySet(ctx.required);

    let ordered = safeReorder(
      (t, tk, rq) => taskAware.reorderByTaskWeight(t, tk, rq),
      targets,
      task,
      required
    );
    ordered = safeReorder(
      (t, cfg, log) => evalRouting.orderTargetsByEvalScores(t, cfg, log),
      ordered,
      ctx.evalConfig,
      ctx.log ?? NOOP_LOG
    );

    const chosen = ordered[0];
    if (!chosen) return null;

    // Web-search native-tool override (ported webSearchRouting).
    let override = { wasRouted: false, model: chosen.model };
    try {
      override =
        webSearch.resolveWebSearchRouteOverride(
          chosen.model,
          ctx.body,
          ctx.settings || {}
        ) ?? override;
    } catch {
      override = { wasRouted: false, model: chosen.model };
    }

    const finalModel = override.wasRouted ? override.model : chosen.model;

    const route = {
      provider: chosen.provider ?? ctx.provider ?? null,
      model: finalModel,
      strategy: ctx.strategy ?? (override.wasRouted ? "web-search" : "auto"),
      task: task.level
    };

    // Attach the ported routing module's live quality score when we have a
    // provider/model (informational; JSON-serializable number).
    try {
      if (route.provider && route.model) {
        route.quality = routing.qualityScoreFor(route.provider, route.model);
      }
    } catch {
      // quality is best-effort
    }
    if (routingInfo) route.otelEnabled = routingInfo.otelEnabled === true;

    return route;
  } catch {
    // Graceful degradation: signal "no route" so the engine falls back.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function resolveAdmissionConfigFromRuntime(runtime) {
  try {
    return runtime.resolveAdaptiveAdmissionConfigFromEnv(process.env);
  } catch {
    return { ...runtime.DEFAULT_ADAPTIVE_ADMISSION_CONFIG };
  }
}

function buildConfigSnapshot(admission, runtime, routing) {
  const base = {
    loaded: true,
    admission: resolveAdmissionConfigFromRuntime(runtime),
    admissionCost: admission.DEFAULT_ADMISSION_COST_CONFIG,
    routing: { initialized: false, sinks: [], otelEnabled: false }
  };
  try {
    const info = routing.initRoutingObservability();
    base.routing = {
      initialized: true,
      sinks: info.sinks,
      otelEnabled: info.otelEnabled
    };
  } catch {
    base.routing = { initialized: false, sinks: [], otelEnabled: false };
  }
  return base;
}

async function warmConfigCache() {
  try {
    const [admission, runtime, routing] = await Promise.all([
      loadAdmissionModule(),
      loadAdmissionRuntimeModule(),
      loadRoutingModule()
    ]);
    _configCache = buildConfigSnapshot(admission, runtime, routing);
  } catch {
    // keep whatever snapshot is currently cached
  }
}

/**
 * Expose the ported config (admission runtime config, admission cost config and
 * routing observability status). Sync by contract: returns the cached snapshot
 * immediately and warms it in the background on first use.
 */
export function getRoutingConfig() {
  if (!_configCache) {
    _configCache = {
      loaded: false,
      admission: null,
      admissionCost: null,
      routing: { initialized: false, sinks: [], otelEnabled: false }
    };
    void warmConfigCache();
  }
  return _configCache;
}
