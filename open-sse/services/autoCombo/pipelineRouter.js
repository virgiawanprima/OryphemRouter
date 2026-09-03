import { classifyPromptIntent } from "../intentClassifier.js";
import {
  executePipeline,
  buildPipelineConfig
} from "../../utils/omni/pipeline.js";
import { getTaskFitness } from "./taskFitness.js";
const FITNESS_TIERS = {
  "best-reasoning": { minFitness: 0.85 },
  cheapest: { maxFitness: 0.75 },
  moderate: { minFitness: 0.6, maxFitness: 0.9 }
};
const INTENT_TO_TASK = {
  code: "code",
  math: "math",
  reasoning: "reasoning",
  creative: "creative",
  medium: "medium",
  simple: "simple"
};
function resolveModelForTier(tier, availableModels, taskType) {
  const scored = availableModels.map((model) => ({
    model,
    fitness: getTaskFitness(model, taskType)
  })).sort((a, b) => b.fitness - a.fitness);
  const tierConfig = FITNESS_TIERS[tier];
  if (!tierConfig) return scored[0]?.model ?? "deepseek-chat";
  const filtered = scored.filter(({ fitness }) => {
    if (tierConfig.minFitness !== void 0 && fitness < tierConfig.minFitness) return false;
    if (tierConfig.maxFitness !== void 0 && fitness > tierConfig.maxFitness) return false;
    return true;
  });
  return filtered[0]?.model ?? scored[0]?.model ?? "deepseek-chat";
}
function createStageExecutor(body, handleChatCore, log, availableModels, taskType) {
  return async ({
    messages,
    stream,
    fitnessTier
  }) => {
    const model = fitnessTier ? resolveModelForTier(fitnessTier, availableModels, taskType) : void 0;
    const stageBody = {
      ...body,
      messages,
      stream
    };
    log.info("PIPELINE", `Stage: tier=${fitnessTier}, model=${model}, stream=${stream}`);
    const response = await handleChatCore(stageBody, model);
    if (stream) {
      return { text: "", response };
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      log.warn("PIPELINE", `Stage returned ${response.status}: ${errorText.slice(0, 200)}`);
      return { text: "" };
    }
    try {
      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        return { text: content };
      }
      return { text: JSON.stringify(json) };
    } catch {
      log.warn("PIPELINE", "Failed to parse stage response as JSON");
      return { text: "" };
    }
  };
}
function estimateTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += Math.ceil(msg.content.length / 4);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === "object" && part !== null && typeof part.text === "string") {
          total += Math.ceil(part.text.length / 4);
        }
      }
    }
  }
  return total;
}
async function handlePipelineCombo({
  body,
  combo,
  availableModels: routedModels,
  handleChatCore,
  log,
  settings,
  signal
}) {
  const config = combo.config;
  const pipelineEnabled = config?.pipeline_enabled ?? settings.pipeline_enabled ?? false;
  if (!pipelineEnabled) {
    log.info("PIPELINE", "Pipeline disabled for this combo");
    throw new Error("PIPELINE_DISABLED");
  }
  const messages = body.messages || [];
  const tokenEstimate = estimateTokens(messages);
  const skipThreshold = config?.skip_pipeline_for_tokens_under ?? settings.skip_pipeline_for_tokens_under ?? 50;
  if (tokenEstimate < skipThreshold) {
    log.info(
      "PIPELINE",
      `Token estimate ${tokenEstimate} < threshold ${skipThreshold}, skipping pipeline`
    );
    throw new Error("PIPELINE_TOKEN_THRESHOLD");
  }
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const promptText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : Array.isArray(lastUserMsg?.content) ? lastUserMsg.content.filter((b) => b.type === "text").map((b) => b.text || "").join(" ") : "";
  const systemMsg = messages.find((m) => m.role === "system");
  const systemText = typeof systemMsg?.content === "string" ? systemMsg.content : void 0;
  const intent = classifyPromptIntent(promptText, systemText);
  const taskType = INTENT_TO_TASK[intent] ?? "simple";
  log.info("PIPELINE", `Intent: ${intent} \u2192 task: ${taskType}`);
  const pipelineConfig = buildPipelineConfig(promptText, taskType);
  const rawComboModels = combo.models;
  const comboModels = Array.isArray(rawComboModels) ? rawComboModels.map((entry) => {
    if (typeof entry === "string") return entry;
    const model = entry?.model;
    return typeof model === "string" ? model : null;
  }).filter((model) => typeof model === "string" && model.length > 0) : [];
  const availableModels = routedModels === void 0 ? comboModels.length ? comboModels : ["deepseek-chat"] : routedModels;
  if (availableModels.length === 0) throw new Error("PIPELINE_NO_MODELS");
  const stageExecutor = createStageExecutor(body, handleChatCore, log, availableModels, taskType);
  const maxReflectionLoops = config?.max_reflection_loops ?? settings.max_reflection_loops ?? 1;
  const wrappedExecutor = async (args) => {
    return stageExecutor({ ...args, fitnessTier: args.fitnessTier });
  };
  let result = await executePipeline(pipelineConfig, wrappedExecutor);
  let reflectionCount = 0;
  while (result.reflectVerdict === "fail" && reflectionCount < maxReflectionLoops) {
    reflectionCount++;
    log.info(
      "PIPELINE",
      `Reflection failed, re-running (loop ${reflectionCount}/${maxReflectionLoops})`
    );
    const retryConfig = buildPipelineConfig(promptText, taskType);
    const retryResult = await executePipeline(retryConfig, wrappedExecutor);
    if (retryResult.reflectVerdict === "pass") {
      result = retryResult;
      break;
    }
  }
  if (result.reflectVerdict === "fail" && reflectionCount > 0) {
    log.warn(
      "PIPELINE",
      `Reflection retries exhausted (${reflectionCount}/${maxReflectionLoops}) \u2014 pipeline verdict still "fail", returning the original failed result`
    );
  }
  const lastStage = result.stages[result.stages.length - 1];
  if (lastStage?.text === "" && result.text) {
    return result;
  }
  log.info(
    "PIPELINE",
    `Complete: ${result.stages.length} stages, fallback=${result.fallback}, verdict=${result.reflectVerdict}`
  );
  return result;
}
function buildPipelineResponse(result, body) {
  const model = typeof body.model === "string" && body.model.length > 0 ? body.model : "auto";
  const id = `chatcmpl-pipeline-${Date.now()}`;
  const created = Math.floor(Date.now() / 1e3);
  const content = result.text ?? "";
  if (body.stream !== true) {
    const payload = {
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop"
        }
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  const chunk = (delta, finishReason) => `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }]
  })}

`;
  const sse = chunk({ role: "assistant", content }, null) + chunk({}, "stop") + "data: [DONE]\n\n";
  return new Response(sse, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
export {
  FITNESS_TIERS,
  buildPipelineResponse,
  handlePipelineCombo
};
