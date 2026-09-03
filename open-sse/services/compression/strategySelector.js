import { applyHardBudget } from "./hardBudget.js";
import { gateAdvance } from "./fidelityGateStep.js";
import { applyLiteCompression } from "./lite.js";
import { cavemanCompress } from "./caveman.js";
import { compressAggressive } from "./aggressive.js";
import { ultraCompress, ultraCompressHeuristic } from "./ultra.js";
import { createCompressionStats } from "./stats.js";
import { applyStackedInflationGuard } from "./pipelineGuards.js";
import {
  resolvePipelineBreakerConfig,
  canRunEngine,
  recordEngineFailure,
  recordEngineSuccess
} from "./pipelineEngineBreaker.js";
import {
  createStackAccumulator,
  decideStep,
  mergeStackStep
} from "./stackedStepCore.js";
import { resolveStepDetailConfig } from "./stepDetailConfig.js";
import { registerBuiltinCompressionEngines } from "./engines/index.js";
import { getCompressionEngine, getEngineEntry } from "./engines/registry.js";
import { codexResponsesEngine } from "./engines/codexResponses/index.js";
import { applyOmniglyphSingleMode } from "./engines/omniglyphSingleMode.js";
import { applyRtkCompression } from "./engines/rtk/index.js";
import { adaptBodyForCompression } from "./bodyAdapter.js";
import {
  detectCachingContext,
  getCacheAwareStrategy
} from "./cachingAware.js";
import { resolveCompressionPlan } from "./resolveCompressionPlan.js";
import { deriveDefaultPlan } from "./deriveDefaultPlan.js";
import {
  withSource,
  planFromHeader,
  formatCompressionMeta,
  formatCompressionAnnotation,
  deriveDefaultPlanFromConfig,
  buildNamedComboLookup
} from "./planResolution.js";
import { resolveAdaptivePlan } from "./adaptiveCompression/resolveAdaptivePlan.js";
import { resolveRiskGate, withRiskGate, withRiskGateAsync } from "./riskGate/strategyWrap.js";
import {
  withCompressionEntrypointGuards,
  withCompressionEntrypointGuardsAsync
} from "./entrypointWrap.js";
import { makeMemoKey, memoLookup, memoStore, isDeterministicMode } from "./resultMemo.js";
import { resolveCacheAwareConfig } from "./cacheAwareConfig.js";
function checkComboOverride(config, comboId) {
  if (!comboId || !config.comboOverrides) return null;
  return config.comboOverrides[comboId] ?? null;
}
function shouldAutoTrigger(config, estimatedTokens) {
  return config.autoTriggerTokens > 0 && estimatedTokens >= config.autoTriggerTokens;
}
function adaptiveEnabled(config) {
  const mode = config.contextBudget?.mode;
  return mode === "floor" || mode === "replace-autotrigger";
}
function resolveBasePlan(config, comboId, estimatedTokens, combos = {}, header = null) {
  if (!config.enabled) return withSource({ mode: "off", stackedPipeline: [] }, "off");
  if (header) {
    const fromHeader = planFromHeader(config, header, combos);
    if (fromHeader) return fromHeader;
  }
  const comboMode = checkComboOverride(config, comboId);
  if (comboMode) {
    return withSource(resolveCompressionPlan(config, { comboId, combos }), "routing-override");
  }
  if (config.activeComboId && combos[config.activeComboId]) {
    return withSource(
      { mode: "stacked", stackedPipeline: combos[config.activeComboId] },
      "active-profile"
    );
  }
  if (!adaptiveEnabled(config) && shouldAutoTrigger(config, estimatedTokens)) {
    const mode = config.autoTriggerMode ?? "lite";
    return withSource(
      mode === "stacked" ? { mode, stackedPipeline: config.stackedPipeline ?? [] } : { mode, stackedPipeline: [] },
      "auto-trigger"
    );
  }
  const plan = deriveDefaultPlanFromConfig(config, comboId, combos);
  return withSource(plan, plan.mode === "off" ? "off" : "default");
}
function enginesMapDerivesStackedPipeline(config) {
  if (!config.enginesExplicit) return false;
  const plan = deriveDefaultPlan(config.engines ?? {}, config.enabled !== false);
  return plan.mode === "stacked" && plan.stackedPipeline.length > 0;
}
function activeComboResolves(config, combos = {}) {
  return Boolean(config.activeComboId && combos[config.activeComboId]);
}
function getEffectiveMode(config, comboId, estimatedTokens, combos = {}, header = null) {
  return resolveBasePlan(config, comboId, estimatedTokens, combos, header).mode;
}
function selectCompressionPlan(config, comboId, estimatedTokens, body, context, combos = {}, header = null, adaptiveOptions) {
  let plan = resolveBasePlan(config, comboId, estimatedTokens, combos, header);
  if (!config.enabled) return plan;
  if (adaptiveEnabled(config) && config.contextBudget) {
    const { plan: adaptivePlan, telemetry } = resolveAdaptivePlan({
      basePlan: plan,
      estimatedTokens,
      modelContextLimit: adaptiveOptions?.modelContextLimit ?? null,
      requestMaxTokens: adaptiveOptions?.requestMaxTokens ?? null,
      config: config.contextBudget
    });
    plan = adaptivePlan;
    if (telemetry && adaptiveOptions?.onAdaptive) adaptiveOptions.onAdaptive(telemetry);
  }
  if (body) {
    const ctx = detectCachingContext(body, context);
    const cacheAware = getCacheAwareStrategy(plan.mode, ctx);
    return { ...plan, mode: cacheAware.strategy };
  }
  return plan;
}
function selectCompressionStrategy(config, comboId, estimatedTokens, body, context, combos = {}, header = null) {
  return selectCompressionPlan(config, comboId, estimatedTokens, body, context, combos, header).mode;
}
function applyCompression(body, mode, options) {
  return withCompressionEntrypointGuards(body, options, (b) => runCompression(b, mode, options));
}
function runCompression(body, mode, options) {
  if (mode === "off") {
    return { body, compressed: false, stats: null };
  }
  if (options?.config?.memoizeCompressionResults === true && // Only memoize for an explicit principal — a missing principalId would collapse
  // authenticated callers into the shared anonymous (null) key space and let one
  // principal receive another's cached body. No principal ⇒ skip the cache.
  typeof options?.principalId === "string" && options.principalId.length > 0 && isDeterministicMode(mode, options.config)) {
    const key = makeMemoKey(
      body,
      mode,
      options.config,
      options.principalId,
      options.model,
      options.supportsVision
    );
    const hit = memoLookup(key);
    if (hit) return hit;
    const result = runCompression({ ...body }, mode, {
      ...options,
      config: { ...options.config, memoizeCompressionResults: false }
    });
    memoStore(key, result);
    return memoLookup(key);
  }
  if (mode === "rtk") {
    return applyRtkCompression(body, {
      // Selecting the "rtk" mode IS the enable signal — run it even if the per-engine
      // rtkConfig.enabled flag is off (that flag gates stacked steps). (B-MODE-ENGINE-DECOUPLE)
      config: { ...options?.config?.rtkConfig ?? {}, enabled: true }
    });
  }
  if (mode === "codex-responses") {
    const adapter2 = adaptBodyForCompression(
      body,
      options?.config?.codexResponsesConfig?.preserveToolNames
    );
    const result = codexResponsesEngine.apply(adapter2.body, {
      ...options,
      config: options?.config,
      stepConfig: { enabled: true }
    });
    return adapter2.adapted ? { ...result, body: adapter2.restore(result.body) } : result;
  }
  if (mode === "omniglyph") {
    return { body, compressed: false, stats: null };
  }
  const adapter = adaptBodyForCompression(
    body,
    options?.config?.codexResponsesConfig?.preserveToolNames
  );
  const compressionBody = adapter.body;
  if (mode === "lite") {
    const result = applyLiteCompression(compressionBody, {
      ...options,
      preserveSystemPrompt: options?.config?.preserveSystemPrompt !== false,
      ...options?.config?.lite
    });
    return adapter.adapted ? { ...result, body: adapter.restore(result.body) } : result;
  }
  if (mode === "stacked") {
    const result = applyStackedCompression(
      compressionBody,
      options?.config?.stackedPipeline,
      options
    );
    return adapter.adapted ? { ...result, body: adapter.restore(result.body) } : result;
  }
  if (mode === "standard") {
    const cavemanConfig = {
      ...options?.config?.cavemanConfig ?? {},
      ...options?.config?.languageConfig?.enabled ? {
        language: options.config.languageConfig.defaultLanguage,
        autoDetectLanguage: options.config.languageConfig.autoDetect,
        enabledLanguagePacks: options.config.languageConfig.enabledPacks
      } : {},
      ...options?.config?.preserveSystemPrompt !== false ? {
        compressRoles: (options?.config?.cavemanConfig?.compressRoles ?? ["user"]).filter(
          (role) => role !== "system"
        )
      } : {},
      // Selecting the "standard" mode runs caveman regardless of the per-engine
      // cavemanConfig.enabled flag (that flag gates stacked steps). (B-MODE-ENGINE-DECOUPLE)
      enabled: true
    };
    const result = cavemanCompress(
      compressionBody,
      cavemanConfig
    );
    return adapter.adapted ? { ...result, body: adapter.restore(result.body) } : result;
  }
  if (mode === "aggressive") {
    const messages = compressionBody.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const aggressiveConfig = {
      ...options?.config?.aggressive ?? {},
      preserveSystemPrompt: options?.config?.preserveSystemPrompt !== false
    };
    const result = compressAggressive(messages, aggressiveConfig);
    const compressedBody = { ...compressionBody, messages: result.messages };
    return {
      body: adapter.restore(compressedBody),
      compressed: result.stats.savingsPercent > 0,
      stats: createCompressionStats(
        compressionBody,
        compressedBody,
        mode,
        ["aggressive"],
        result.stats.rulesApplied,
        result.stats.durationMs
      )
    };
  }
  if (mode === "ultra") {
    const messages = compressionBody.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const ultraConfig = {
      ...options?.config?.ultra ?? {},
      preserveSystemPrompt: options?.config?.preserveSystemPrompt !== false
    };
    const result = ultraCompressHeuristic(messages, ultraConfig);
    const compressedBody = { ...compressionBody, messages: result.messages };
    return {
      body: adapter.restore(compressedBody),
      compressed: result.stats.savingsPercent > 0,
      stats: {
        ...createCompressionStats(
          compressionBody,
          compressedBody,
          mode,
          ["ultra"],
          result.stats.rulesApplied,
          result.stats.durationMs
        ),
        ultraTier: result.stats.ultraTier
      }
    };
  }
  return { body, compressed: false, stats: null };
}
async function applyCompressionAsync(body, mode, options) {
  return withCompressionEntrypointGuardsAsync(
    body,
    options,
    (b) => runCompressionAsync(b, mode, options)
  );
}
async function runCompressionAsync(body, mode, options) {
  const workerOptions = options ? {
    model: options.model,
    supportsVision: options.supportsVision,
    providerTransport: options.providerTransport,
    provider: options.provider,
    imageTransportFidelity: options.imageTransportFidelity,
    sourceFormat: options.sourceFormat,
    targetFormat: options.targetFormat,
    compressionStage: options.compressionStage,
    config: options.config
  } : void 0;
  const { isCompressionWorkerEligible } = await import("./compressionWorkerProtocol.ts");
  if (isCompressionWorkerEligible(body, mode, workerOptions)) {
    try {
      const { runCompressionInWorker } = await import("./compressionWorkerPool.ts");
      return await runCompressionInWorker(body, mode, workerOptions, options?.onEngineStep);
    } catch {
      return { body, compressed: false, stats: null };
    }
  }
  if (options?.config?.memoizeCompressionResults === true && // Only memoize for an explicit principal — a missing principalId would collapse
  // authenticated callers into the shared anonymous (null) key space and let one
  // principal receive another's cached body. No principal ⇒ skip the cache.
  typeof options?.principalId === "string" && options.principalId.length > 0 && isDeterministicMode(mode, options.config)) {
    const key = makeMemoKey(
      body,
      mode,
      options.config,
      options.principalId,
      options.model,
      options.supportsVision
    );
    const hit = memoLookup(key);
    if (hit) return hit;
    const result = await runCompressionAsync({ ...body }, mode, {
      ...options,
      config: { ...options.config, memoizeCompressionResults: false }
    });
    memoStore(key, result);
    return memoLookup(key);
  }
  if (mode === "omniglyph") return applyOmniglyphSingleMode(body, options);
  if (mode === "stacked") {
    const adapter = options?.compressionStage === "post-translation" ? { body, adapted: false, restore: (next) => next } : adaptBodyForCompression(body, options?.config?.codexResponsesConfig?.preserveToolNames);
    const result = await applyStackedCompressionAsync(
      adapter.body,
      options?.config?.stackedPipeline,
      options
    );
    return adapter.adapted ? { ...result, body: adapter.restore(result.body) } : result;
  }
  if (mode === "ultra") {
    return applyUltraAsync(body, options);
  }
  return applyCompression(body, mode, options);
}
async function applyUltraAsync(body, options) {
  const ultraConfig = options?.config?.ultra;
  const modelPath = typeof ultraConfig?.modelPath === "string" ? ultraConfig.modelPath.trim() : "";
  if (!modelPath) {
    const adapter = adaptBodyForCompression(
      body,
      options?.config?.codexResponsesConfig?.preserveToolNames
    );
    const messages = adapter.body.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const ultraConfig2 = {
      ...options?.config?.ultra ?? {},
      preserveSystemPrompt: options?.config?.preserveSystemPrompt !== false,
      ultraEngine: options?.config?.ultraEngine
    };
    const result = await ultraCompress(messages, ultraConfig2);
    const compressedBody = { ...adapter.body, messages: result.messages };
    return {
      body: adapter.restore(compressedBody),
      compressed: result.stats.savingsPercent > 0,
      stats: {
        ...createCompressionStats(
          adapter.body,
          compressedBody,
          "ultra",
          result.stats.techniquesUsed,
          result.stats.rulesApplied,
          result.stats.durationMs
        ),
        ultraTier: result.stats.ultraTier
      }
    };
  }
  registerBuiltinCompressionEngines();
  const slmEngine = getCompressionEngine("llmlingua");
  if (slmEngine?.applyAsync) {
    const engineOptions = {
      model: options?.model,
      supportsVision: options?.supportsVision,
      config: options?.config,
      principalId: options?.principalId,
      stepConfig: {
        modelPath,
        ...typeof ultraConfig?.compressionRate === "number" ? { compressionRate: ultraConfig.compressionRate } : {}
      }
    };
    try {
      const slm = await slmEngine.applyAsync(body, engineOptions);
      if (slm.compressed && slm.stats) {
        return {
          ...slm,
          stats: {
            ...slm.stats,
            mode: "ultra",
            techniquesUsed: Array.from(/* @__PURE__ */ new Set([...slm.stats.techniquesUsed ?? [], "ultra-slm"]))
          }
        };
      }
    } catch {
    }
  }
  return applyCompression(
    body,
    ultraConfig?.slmFallbackToAggressive ? "aggressive" : "ultra",
    options
  );
}
function normalizePipelineStep(step) {
  if (typeof step !== "string") return step;
  if (step === "standard") return { engine: "caveman" };
  if (step === "rtk" || step === "codex-responses") return { engine: step };
  if (step === "lite" || step === "aggressive" || step === "ultra") return { engine: step };
  return { engine: "caveman" };
}
function reportEngineStep(onStep, stepIndex, totalSteps, engine, result) {
  if (!onStep) return;
  const s = result.stats;
  onStep({
    stepIndex,
    totalSteps,
    engine,
    state: result.compressed ? "done" : "skipped",
    originalTokens: s?.originalTokens ?? 0,
    compressedTokens: s?.compressedTokens ?? s?.originalTokens ?? 0,
    savingsPercent: s?.savingsPercent ?? 0,
    ...s?.durationMs !== void 0 ? { durationMs: s.durationMs } : {}
  });
}
function resolveStackSteps(pipeline, config) {
  if (pipeline && pipeline.length > 0) return pipeline.map(normalizePipelineStep);
  const engines = config?.engines;
  if (engines && Object.values(engines).some((e) => e?.enabled === true)) {
    const derived = deriveDefaultPlan(engines, true);
    if (derived.mode === "stacked" && derived.stackedPipeline.length > 0) {
      return derived.stackedPipeline;
    }
  }
  return [
    { engine: "rtk", intensity: "standard" },
    { engine: "caveman", intensity: "full" }
  ];
}
function buildStepOptions(step, options) {
  const stepConfig = {
    ...resolveStepDetailConfig(step.engine, options?.config),
    ...step.config ?? {},
    ...step.intensity ? { intensity: step.intensity } : {}
  };
  if (step.engine === "codex-responses" && stepConfig.enabled === void 0) {
    stepConfig.enabled = true;
  }
  return {
    ...options,
    compressionComboId: options?.compressionComboId ?? options?.config?.compressionComboId,
    principalId: options?.principalId,
    stepConfig
  };
}
function canRunAtCompressionStage(engine, stage) {
  const effectiveStage = stage ?? "pre-translation";
  const stages = engine.metadata?.executionStages;
  return stages ? stages.includes(effectiveStage) : effectiveStage === "pre-translation";
}
function finalizeStackedResult(originalBody, currentBody, compressed, acc, start, compressionComboId) {
  const stats = createCompressionStats(
    originalBody,
    currentBody,
    "stacked",
    Array.from(acc.techniques),
    acc.rules.size > 0 ? Array.from(acc.rules) : void 0,
    Math.round((performance.now() - start) * 100) / 100
  );
  stats.engine = "stacked";
  stats.compressionComboId = compressionComboId ?? null;
  stats.engineBreakdown = acc.breakdown;
  if (acc.validationWarnings.size > 0) {
    stats.validationWarnings = Array.from(acc.validationWarnings);
  }
  if (acc.validationErrors.size > 0) {
    stats.validationErrors = Array.from(acc.validationErrors);
  }
  if (acc.fallbackApplied) {
    stats.fallbackApplied = true;
  }
  if (acc.rtkRawOutputPointers.length > 0) {
    const seenPointers = /* @__PURE__ */ new Set();
    stats.rtkRawOutputPointers = acc.rtkRawOutputPointers.filter((pointer) => {
      if (seenPointers.has(pointer.id)) return false;
      seenPointers.add(pointer.id);
      return true;
    });
  }
  return applyStackedInflationGuard(originalBody, currentBody, compressed, stats);
}
function recordStepFailure(acc, engineId, err, ctx) {
  if (ctx.breakerOn) recordEngineFailure(engineId, ctx.breaker);
  acc.validationErrors.add(
    `${engineId}: bailed out \u2014 ${err instanceof Error ? err.message : String(err)}`
  );
  acc.fallbackApplied = true;
}
function commitStepResult(acc, step, result, currentBody, ctx) {
  if (ctx.breakerOn) recordEngineSuccess(step.engine, ctx.breaker);
  mergeStackStep(acc, step.engine, result);
  const advance = ctx.bailout?.enabled ? decideStep(result, ctx.bailout).advance : result.compressed;
  if (advance && gateAdvance(result, currentBody, ctx.fidelityGate, acc, step.engine)) {
    return { body: result.body, advanced: true };
  }
  return { body: currentBody, advanced: false };
}
function applyStackedCompression(body, pipeline, options) {
  return withRiskGate(
    body,
    resolveRiskGate(options),
    (b) => runStackedCompression(b, pipeline, options)
  );
}
function runStackedCompression(body, pipeline, options) {
  const steps = resolveStackSteps(pipeline, options?.config);
  registerBuiltinCompressionEngines();
  let currentBody = body;
  let compressed = false;
  const acc = createStackAccumulator();
  const start = performance.now();
  const bailout = options?.bailout;
  const breaker = resolvePipelineBreakerConfig(
    options?.circuitBreaker ?? options?.config?.pipelineCircuitBreaker
  );
  const breakerOn = breaker.enabled;
  const fidelityGate = options?.fidelityGate ?? options?.config?.fidelityGate;
  const onStep = options?.onEngineStep;
  const totalSteps = steps.length;
  let stepIdx = 0;
  for (const step of steps) {
    const engine = getCompressionEngine(step.engine);
    if (!engine) {
      acc.validationErrors.add(`Unknown compression engine: "${step.engine}"`);
      continue;
    }
    if (!canRunAtCompressionStage(engine, options?.compressionStage)) {
      acc.validationWarnings.add(
        `${step.engine}: skipped (stage ${options?.compressionStage ?? "pre-translation"})`
      );
      continue;
    }
    if (getEngineEntry(step.engine)?.enabled === false) {
      acc.validationWarnings.add(`${step.engine}: skipped (engine disabled in registry)`);
      continue;
    }
    if (breakerOn && !canRunEngine(step.engine, breaker)) {
      acc.validationWarnings.add(`${step.engine}: skipped (pipeline circuit-breaker open)`);
      continue;
    }
    const ctx = { bailout, breakerOn, breaker, fidelityGate };
    let result;
    if (bailout?.enabled || breakerOn) {
      try {
        result = engine.apply(currentBody, buildStepOptions(step, options));
      } catch (err) {
        recordStepFailure(acc, step.engine, err, ctx);
        continue;
      }
    } else {
      result = engine.apply(currentBody, buildStepOptions(step, options));
    }
    const committed = commitStepResult(acc, step, result, currentBody, ctx);
    currentBody = committed.body;
    if (committed.advanced) compressed = true;
    if (!bailout?.enabled) reportEngineStep(onStep, stepIdx++, totalSteps, step.engine, result);
  }
  if (options?.config?.targetTokens != null || options?.config?.targetRatio != null) {
    const hbResult = applyHardBudget(currentBody, {
      targetTokens: options.config.targetTokens,
      targetRatio: options.config.targetRatio
    });
    if (hbResult.compressed) {
      mergeStackStep(acc, "hard-budget", hbResult);
      currentBody = hbResult.body;
      compressed = true;
    } else {
      hbResult.stats?.validationWarnings?.forEach((w) => acc.validationWarnings.add(w));
    }
  }
  return finalizeStackedResult(
    body,
    currentBody,
    compressed,
    acc,
    start,
    options?.compressionComboId ?? options?.config?.compressionComboId
  );
}
async function applyStackedCompressionAsync(body, pipeline, options) {
  return withRiskGateAsync(
    body,
    resolveRiskGate(options),
    (b) => runStackedCompressionAsync(b, pipeline, options)
  );
}
async function runStackedCompressionAsync(body, pipeline, options) {
  const steps = resolveStackSteps(pipeline, options?.config);
  registerBuiltinCompressionEngines();
  let currentBody = body;
  let compressed = false;
  const acc = createStackAccumulator();
  const start = performance.now();
  const bailout = options?.bailout;
  const breaker = resolvePipelineBreakerConfig(
    options?.circuitBreaker ?? options?.config?.pipelineCircuitBreaker
  );
  const breakerOn = breaker.enabled;
  const fidelityGate = options?.fidelityGate ?? options?.config?.fidelityGate;
  const onStep = options?.onEngineStep;
  const totalSteps = steps.length;
  let stepIdx = 0;
  for (const step of steps) {
    const engine = getCompressionEngine(step.engine);
    if (!engine) {
      acc.validationErrors.add(`Unknown compression engine: "${step.engine}"`);
      continue;
    }
    if (!canRunAtCompressionStage(engine, options?.compressionStage)) {
      acc.validationWarnings.add(
        `${step.engine}: skipped (stage ${options?.compressionStage ?? "pre-translation"})`
      );
      continue;
    }
    if (getEngineEntry(step.engine)?.enabled === false) {
      acc.validationWarnings.add(`${step.engine}: skipped (engine disabled in registry)`);
      continue;
    }
    if (breakerOn && !canRunEngine(step.engine, breaker)) {
      acc.validationWarnings.add(`${step.engine}: skipped (pipeline circuit-breaker open)`);
      continue;
    }
    const stepOptions = buildStepOptions(step, options);
    const ctx = { bailout, breakerOn, breaker, fidelityGate };
    let result;
    if (bailout?.enabled || breakerOn) {
      try {
        result = engine.applyAsync ? await engine.applyAsync(currentBody, stepOptions) : engine.apply(currentBody, stepOptions);
      } catch (err) {
        recordStepFailure(acc, step.engine, err, ctx);
        continue;
      }
    } else {
      result = engine.applyAsync ? await engine.applyAsync(currentBody, stepOptions) : engine.apply(currentBody, stepOptions);
    }
    const committed = commitStepResult(acc, step, result, currentBody, ctx);
    currentBody = committed.body;
    if (committed.advanced) compressed = true;
    if (!bailout?.enabled) reportEngineStep(onStep, stepIdx++, totalSteps, step.engine, result);
  }
  if (options?.config?.targetTokens != null || options?.config?.targetRatio != null) {
    const hbResult = applyHardBudget(currentBody, {
      targetTokens: options.config.targetTokens,
      targetRatio: options.config.targetRatio
    });
    if (hbResult.compressed) {
      mergeStackStep(acc, "hard-budget", hbResult);
      currentBody = hbResult.body;
      compressed = true;
    } else {
      hbResult.stats?.validationWarnings?.forEach((w) => acc.validationWarnings.add(w));
    }
  }
  return finalizeStackedResult(
    body,
    currentBody,
    compressed,
    acc,
    start,
    options?.compressionComboId ?? options?.config?.compressionComboId
  );
}
export {
  activeComboResolves,
  applyCompression,
  applyCompressionAsync,
  applyStackedCompression,
  applyStackedCompressionAsync,
  buildNamedComboLookup,
  checkComboOverride,
  enginesMapDerivesStackedPipeline,
  formatCompressionAnnotation,
  formatCompressionMeta,
  getEffectiveMode,
  planFromHeader,
  resolveCacheAwareConfig,
  selectCompressionPlan,
  selectCompressionStrategy,
  shouldAutoTrigger
};
