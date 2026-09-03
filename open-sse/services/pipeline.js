import { errorResponse } from "../utils/errorSanitize.js";
import { extractPanelText } from "./fusion.js";
function getStepModel(step) {
  return "target" in step ? step.target.modelStr : step.model;
}
function getStepTarget(step) {
  return "target" in step ? step.target : void 0;
}
function prependSystemInstruction(body, prompt) {
  const sys = typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;
  const next = { ...body };
  if (!sys) return next;
  if (Array.isArray(body.input)) {
    next.input = [{ role: "system", content: sys }, ...body.input];
  } else if (Array.isArray(body.contents)) {
    next.contents = [{ role: "user", parts: [{ text: sys }] }, ...body.contents];
  } else if (Array.isArray(body.messages)) {
    next.messages = [{ role: "system", content: sys }, ...body.messages];
  } else {
    next.messages = [{ role: "system", content: sys }];
  }
  return next;
}
function buildTransformBody(body, prompt, input) {
  const next = { ...body };
  const sys = typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;
  if (Array.isArray(body.input)) {
    const turns = [];
    if (sys) turns.push({ role: "system", content: sys });
    turns.push({ role: "user", content: input });
    next.input = turns;
    delete next.messages;
    delete next.contents;
  } else if (Array.isArray(body.contents)) {
    const text = sys ? `${sys}

${input}` : input;
    next.contents = [{ role: "user", parts: [{ text }] }];
    delete next.messages;
    delete next.input;
  } else {
    const turns = [];
    if (sys) turns.push({ role: "system", content: sys });
    turns.push({ role: "user", content: input });
    next.messages = turns;
  }
  return next;
}
function stripStreaming(body) {
  const { tools: _tools, tool_choice: _tc, ...rest } = body;
  void _tools;
  void _tc;
  return { ...rest, stream: false };
}
const TRANSIENT_STATUS = /* @__PURE__ */ new Set([429, 502, 503, 504]);
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function handlePipelineChat({
  body,
  steps,
  handleSingleModel,
  log,
  comboName,
  maxRetries = 0,
  retryDelayMs = 1e3
}) {
  const chain = (Array.isArray(steps) ? steps : []).filter(
    (step) => Boolean(step && getStepModel(step))
  );
  if (chain.length === 0) {
    return errorResponse(400, "Pipeline combo has no models");
  }
  log.info(
    "PIPELINE",
    `Combo "${comboName ?? ""}" | steps=${chain.length} [${chain.map(getStepModel).join(" -> ")}]`
  );
  if (chain.length === 1) {
    const step = chain[0];
    return handleSingleModel(
      prependSystemInstruction(body, step.prompt),
      getStepModel(step),
      getStepTarget(step)
    );
  }
  let prevOutput = "";
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const stepModel = getStepModel(step);
    const stepTarget = getStepTarget(step);
    const isFinal = i === chain.length - 1;
    const isFirst = i === 0;
    let stepBody = isFirst ? prependSystemInstruction(body, step.prompt) : buildTransformBody(body, step.prompt, prevOutput);
    if (!isFinal) stepBody = stripStreaming(stepBody);
    const t0 = Date.now();
    let res = await handleSingleModel(stepBody, stepModel, stepTarget);
    if (isFinal) {
      log.info("PIPELINE", `Final step ${stepModel} responded (${Date.now() - t0}ms)`);
      return res;
    }
    for (let attempt = 0; attempt < maxRetries && !res.ok && TRANSIENT_STATUS.has(res.status); attempt++) {
      log.warn(
        "PIPELINE",
        `Step ${i + 1} (${stepModel}) transient ${res.status}, retrying ${attempt + 1}/${maxRetries} in ${retryDelayMs}ms`
      );
      await sleep(retryDelayMs);
      res = await handleSingleModel(stepBody, stepModel, stepTarget);
    }
    if (!res.ok) {
      log.warn("PIPELINE", `Step ${i + 1} (${stepModel}) failed`, {
        status: res.status
      });
      const status = res.status >= 400 && res.status <= 599 ? res.status : 502;
      return errorResponse(status, `Pipeline step ${i + 1} (${stepModel}) failed`);
    }
    try {
      const json = await res.clone().json();
      prevOutput = extractPanelText(json);
    } catch {
      log.warn("PIPELINE", `Step ${i + 1} (${stepModel}) returned an unparseable body`);
      return errorResponse(
        502,
        `Pipeline step ${i + 1} (${stepModel}) returned an unparseable body`
      );
    }
    if (!prevOutput.trim()) {
      log.warn("PIPELINE", `Step ${i + 1} (${stepModel}) returned empty output`);
      return errorResponse(502, `Pipeline step ${i + 1} (${stepModel}) returned empty output`);
    }
    log.info(
      "PIPELINE",
      `Step ${i + 1} ${stepModel} ok (${prevOutput.length} chars, ${Date.now() - t0}ms)`
    );
  }
  return errorResponse(500, "Pipeline produced no final response");
}
export {
  buildTransformBody,
  handlePipelineChat,
  prependSystemInstruction
};
