import { errorResponse } from "../../utils/errorSanitize.js";
const CHAOS_DEFAULTS = {
  /** Absolute cap on wall time for the whole panel. */
  panelHardTimeoutMs: 12e4,
  /** If fewer than this many succeed, fall back to a plain single-model answer. */
  minPanel: 1
};
function serializeChaosPart(part, isFinal, emitCustomEvent = false) {
  const meta = {
    type: "omni-chaos-part",
    model: part.model,
    index: part.index,
    ok: part.ok,
    final: isFinal,
    ...part.error ? { error: part.error } : {}
  };
  const comment = `: chaos ${part.index} ${part.ok ? "ok" : "fail"} ${part.model}
`;
  if (!emitCustomEvent) {
    return comment + "\n";
  }
  return comment + `event: omni-chaos-part
data: ${JSON.stringify(meta)}

`;
}
function withTimeout(p, ms, fallback, onTimeout) {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}
const SSE_SEP = "\n\n";
const SSE_DONE = "data: [DONE]\n\n";
function chatChunk(id, model, content, finishReason = "stop") {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    model,
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content },
        finish_reason: finishReason
      }
    ]
  })}` + SSE_SEP;
}
function dispatchOnePanelModel(opts) {
  const { body, model, index, handleSingleModel, ctrl, hardTimeout, log, onResult } = opts;
  return withTimeout(
    (async () => {
      try {
        const res = await handleSingleModel(body, model, {
          modelAbortSignal: ctrl.signal
        });
        const text = await extractText(res);
        log?.info?.(
          `CHAOS panel ${index} (${model}) ok=${res.ok} status=${res.status} textLen=${text.length}`
        );
        if (res.ok) {
          const part2 = { model, index, ok: true, text };
          await onResult?.(part2);
          return part2;
        }
        const part = {
          model,
          index,
          ok: false,
          text: "",
          error: `upstream ${res.status}: ${text.slice(0, 200) || res.statusText || "error"}`
        };
        await onResult?.(part);
        return part;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log?.warn?.(`CHAOS panel ${index} (${model}) failed:`, msg);
        const part = { model, index, ok: false, text: "", error: msg };
        await onResult?.(part);
        return part;
      }
    })(),
    hardTimeout,
    { model, index, ok: false, text: "", error: "chaos-panel-timeout" },
    () => ctrl.abort()
  );
}
async function runChaosPanel(opts) {
  const { body, models, handleSingleModel, log, tuning } = opts;
  const panel = Array.isArray(models) ? models.filter(Boolean) : [];
  const hardTimeout = tuning?.panelHardTimeoutMs ?? CHAOS_DEFAULTS.panelHardTimeoutMs;
  if (panel.length === 0) {
    return { parts: [], primary: null };
  }
  const controllers = panel.map(() => new AbortController());
  const calls = panel.map(
    (model, index) => dispatchOnePanelModel({
      body,
      model,
      index,
      handleSingleModel,
      ctrl: controllers[index],
      hardTimeout,
      log
    })
  );
  const parts = await Promise.all(calls);
  for (const ac of controllers) {
    if (!ac.signal.aborted) ac.abort();
  }
  const successes = parts.filter((p) => p.ok);
  const primary = successes.length > 0 ? successes[successes.length - 1] : null;
  log?.info?.(`CHAOS panel complete: ${successes.length}/${parts.length} succeeded`);
  return { parts, primary };
}
async function extractText(res) {
  if (!res.ok) {
    try {
      const errBody = await res.clone().text();
      return errBody.trim() || `(HTTP ${res.status})`;
    } catch {
      return `(HTTP ${res.status})`;
    }
  }
  let raw;
  try {
    raw = await res.clone().text();
  } catch {
    return "";
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const fromJson = firstTextFromOpenAI(parsed);
      if (fromJson) return fromJson;
      if (typeof parsed?.content === "string") {
        return parsed.content;
      }
    } catch {
    }
  }
  const sse = concatSseText(raw);
  if (sse) return sse;
  return trimmed.length > 0 && !trimmed.startsWith("data:") ? trimmed : "";
}
function firstTextFromOpenAI(obj) {
  if (!obj || typeof obj !== "object") return "";
  const o = obj;
  const choices = o.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = choices[0]?.message;
    if (msg && typeof msg.content === "string") return msg.content;
    const delta = choices[0]?.delta;
    if (delta && typeof delta.content === "string") return delta.content;
  }
  if (typeof o.content === "string") return o.content;
  return "";
}
function concatSseText(sse) {
  const out = [];
  for (const line of sse.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      const choices = json?.choices;
      if (Array.isArray(choices) && choices.length > 0) {
        const delta2 = choices[0]?.delta;
        if (delta2?.content) {
          out.push(String(delta2.content));
          continue;
        }
        const message = choices[0]?.message;
        if (message?.content) {
          out.push(String(message.content));
          continue;
        }
      }
      const delta = json?.delta;
      if (delta && typeof delta.text === "string") {
        out.push(String(delta.text));
      } else if (delta && typeof delta.content === "string") {
        out.push(String(delta.content));
      } else if (typeof json?.content === "string") {
        out.push(String(json.content));
      }
    } catch {
    }
  }
  return out.join("");
}
async function handleChaosChat(opts) {
  const {
    body,
    models,
    handleSingleModel,
    log,
    comboName,
    primaryModel,
    tuning,
    perTargetAdmission
  } = opts;
  const panel = Array.isArray(models) ? models.filter(Boolean) : [];
  const hardTimeout = tuning?.panelHardTimeoutMs ?? CHAOS_DEFAULTS.panelHardTimeoutMs;
  const minPanel = tuning?.minPanel ?? CHAOS_DEFAULTS.minPanel;
  const streamOptions = body?.stream_options;
  const emitCustomEvent = typeof streamOptions === "object" && streamOptions !== null && streamOptions.include_chaos_parts === true;
  if (panel.length === 0) {
    return errorResponse(400, "Chaos combo has no models");
  }
  if (panel.length === 1) {
    return handleSingleModel(body, panel[0]);
  }
  const chunkId = `chaos-${comboName ?? "panel"}`;
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      let enqueueChain = Promise.resolve();
      const safeEnqueue = (s) => {
        enqueueChain = enqueueChain.then(() => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(s));
          } catch {
          }
        });
        return enqueueChain;
      };
      const abortControllers = [];
      let panelToDispatch = panel;
      if (perTargetAdmission) {
        const gates = await Promise.all(
          panel.map(async (model) => ({
            model,
            ok: await perTargetAdmission({ modelStr: model, executionKey: model, body })
          }))
        );
        const dropped = gates.filter((g) => !g.ok);
        if (dropped.length > 0) {
          log?.info?.(
            "CHAOS",
            `Skipping ${dropped.length} panel member(s) \u2014 admission lane full: ${dropped.map((g) => g.model).join(", ")}`
          );
        }
        panelToDispatch = gates.filter((g) => g.ok).map((g) => g.model);
      }
      const modelPromises = panelToDispatch.map((model, index) => {
        const ctrl = new AbortController();
        abortControllers.push(ctrl);
        return dispatchOnePanelModel({
          body,
          model,
          index,
          handleSingleModel,
          ctrl,
          hardTimeout,
          log,
          onResult: async (part) => {
            await safeEnqueue(serializeChaosPart(part, false, emitCustomEvent));
          }
        });
      });
      const allParts = await Promise.all(modelPromises);
      const successes = allParts.filter((p) => p.ok);
      for (const ac of abortControllers) {
        if (!ac.signal.aborted) ac.abort();
      }
      if (successes.length === 0) {
        const modelErrors = allParts.map((p) => `${p.model}: ${p.error ?? "unknown"}`).join(" | ");
        log?.warn?.(
          "CHAOS",
          `All chaos panel models failed for ${comboName ?? "panel"}: ${modelErrors}`
        );
        const errText = `All chaos panel models failed \u2014 ${modelErrors}`;
        await safeEnqueue(chatChunk(chunkId, panelToDispatch[0] ?? panel[0] ?? "", errText));
        await safeEnqueue(SSE_DONE);
        await enqueueChain;
        closed = true;
        controller.close();
        return;
      }
      const primaryPart = primaryModel && allParts.find((p) => p.model === primaryModel && p.ok) || allParts.filter((p) => p.ok).slice(-1)[0] || successes[0];
      await safeEnqueue(
        chatChunk(chunkId, primaryPart?.model ?? panel[0], primaryPart?.text ?? "")
      );
      await safeEnqueue(SSE_DONE);
      await enqueueChain;
      closed = true;
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-OmniRoute-Chaos": "true",
      "X-OmniRoute-Chaos-Panel": String(panel.length),
      "X-OmniRoute-Chaos-Primary": primaryModel ?? ""
    }
  });
}
function dispatchChaosFromCombo(args) {
  const { cfg, comboModels, comboName, body, handleSingleModel, log, perTargetAdmission } = args;
  if (!cfg.chaos || typeof cfg.chaos !== "object" || !cfg.chaos.enabled) {
    return null;
  }
  const chaosCfg = cfg.chaos;
  const chaosModels = (comboModels || []).map((m) => {
    if (typeof m === "string") return m;
    if (m && typeof m === "object") {
      const obj = m;
      if (typeof obj.model === "string") return obj.model;
    }
    return null;
  }).filter((m) => Boolean(m));
  const minPanel = chaosCfg.tuning?.minPanel ?? 1;
  const effectiveModels = chaosModels.length >= minPanel ? chaosModels : chaosModels.slice(0, 1);
  log.info("CHAOS", `dispatching parallel panel of ${effectiveModels.length} stable models`);
  return handleChaosChat({
    body,
    models: effectiveModels,
    handleSingleModel,
    log,
    comboName,
    primaryModel: chaosCfg.judgeModel,
    tuning: chaosCfg.tuning,
    perTargetAdmission
  });
}
export {
  CHAOS_DEFAULTS,
  dispatchChaosFromCombo,
  handleChaosChat,
  runChaosPanel,
  serializeChaosPart
};
