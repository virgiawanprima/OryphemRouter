import { errorResponse, sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { extractTextContent } from "../utils/omni/geminiHelper.js";
const FUSION_DEFAULTS = {
  minPanel: 2,
  // answers needed before stragglers get a grace window
  stragglerGraceMs: 8e3,
  // wait this long for laggards once quorum is reached
  panelHardTimeoutMs: 9e4,
  // absolute cap so one hung model can't stall forever
  // Hard cap on panel size (issue #1905). Every panel member is fanned out in
  // parallel and its full response text buffered in memory simultaneously —
  // with the runtime heap capped (Dockerfile OMNIROUTE_MEMORY_MB, default
  // 1024MB), a large panel (reported: ~73 models) with sizable concurrent
  // responses can exceed the heap ceiling and OOM-crash the whole process.
  // Reject oversized panels up front with a clean 400 instead.
  maxPanel: 40
};
function extractPanelText(json) {
  if (!json || typeof json !== "object") return "";
  const j = json;
  const choices = j.choices;
  const choice = choices?.[0];
  if (choice) {
    const msg = choice.message ?? choice.delta ?? {};
    const t = extractTextContent(msg.content);
    if (t.trim()) return t;
    if (typeof choice.text === "string" && choice.text.trim()) return choice.text;
  }
  const claudeText = extractTextContent(j.content);
  if (claudeText.trim()) return claudeText;
  const candidates = j.candidates;
  const parts = candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const t = parts.map((p) => typeof p?.text === "string" ? p.text : "").join("");
    if (t.trim()) return t;
  }
  const output = j.output;
  if (Array.isArray(output)) {
    const t = output.flatMap(
      (o) => Array.isArray(o.content) ? o.content.map(
        (c) => typeof c?.text === "string" ? c.text : ""
      ) : []
    ).join("");
    if (t.trim()) return t;
  }
  return "";
}
function appendUserTurn(body, text) {
  const next = { ...body };
  if (Array.isArray(body.messages)) {
    next.messages = [...body.messages, { role: "user", content: text }];
  } else if (Array.isArray(body.input)) {
    next.input = [...body.input, { role: "user", content: text }];
  } else if (Array.isArray(body.contents)) {
    next.contents = [...body.contents, { role: "user", parts: [{ text }] }];
  } else {
    next.messages = [{ role: "user", content: text }];
  }
  return next;
}
function buildJudgePrompt(answers) {
  const panel = answers.map((a, i) => `[Source ${i + 1}]
${a.text}`).join("\n\n");
  return [
    `You are the JUDGE in a model-fusion panel. ${answers.length} expert models independently answered the user's most recent request. Their responses are below, anonymized by source.`,
    "",
    "Do NOT mention that multiple models were used, and do NOT refer to the sources. Produce ONE authoritative final answer addressed directly to the user.",
    "",
    "First, internally analyze the panel along these dimensions: consensus (points most sources agree on \u2014 usually higher-confidence, but NOT automatically correct), contradictions (where they disagree \u2014 resolve with your own judgment), partial coverage, unique insights only one source surfaced, and blind spots every source missed.",
    "",
    "You are not a vote-counter, and the panel is not a ceiling \u2014 treat it as strong evidence, not as the limit of what you may say. Apply your OWN reasoning and knowledge as a full participant: if the consensus is wrong, incomplete, or outdated, override it and state what is correct; if every source missed something you know, add it; if a lone source is right against the majority, side with it. Do not water down a correct answer to match panel agreement. The only hard limit is honesty \u2014 do not assert facts you are not confident about.",
    "",
    "Then write the best possible final answer \u2014 more complete and correct than any single response, and than the panel as a whole \u2014 with no filler.",
    "",
    "=== PANEL RESPONSES ===",
    panel,
    "=== END PANEL RESPONSES ===",
    "",
    "Now write the final answer to the user's original request."
  ].join("\n");
}
function isToolBearingRequest(body) {
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
  if (!hasTools) return false;
  return body.tool_choice !== "none";
}
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ __timeout: true }), ms);
    Promise.resolve(promise).then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      resolve({ __error: e });
    });
  });
}
function collectPanel(calls, cfg) {
  return new Promise((resolve) => {
    const out = new Array(calls.length);
    let settled = 0;
    let ok = 0;
    let finished = false;
    let graceTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(hardTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve(out);
    };
    const hardTimer = setTimeout(finish, cfg.panelHardTimeoutMs);
    calls.forEach((p, i) => {
      Promise.resolve(p).then((v) => {
        out[i] = v;
      }).catch((e) => {
        out[i] = { __error: e };
      }).finally(() => {
        settled++;
        const slot = out[i];
        if (slot && slot.ok) ok++;
        if (settled === calls.length) return finish();
        if (ok >= cfg.minPanel && !graceTimer) {
          graceTimer = setTimeout(finish, cfg.stragglerGraceMs);
        }
      });
    });
  });
}
function getFusionModelString(model) {
  return typeof model === "string" ? model : model.modelStr;
}
function dispatchFusionModel(handleSingleModel, body, model) {
  return typeof model === "string" ? handleSingleModel(body, model) : handleSingleModel(body, model.modelStr, model);
}
async function handleFusionChat({
  body,
  models,
  handleSingleModel,
  log,
  comboName,
  judgeModel,
  judgeTarget,
  tuning,
  perTargetAdmission
}) {
  const panel = Array.isArray(models) ? models.filter(Boolean) : [];
  if (panel.length === 0) {
    return errorResponse(400, "Fusion combo has no models");
  }
  if (panel.length === 1) {
    return dispatchFusionModel(handleSingleModel, body, panel[0]);
  }
  const maxPanel = tuning?.maxPanel ?? FUSION_DEFAULTS.maxPanel;
  if (panel.length > maxPanel) {
    log.warn(
      "FUSION",
      `Combo "${comboName ?? ""}" panel=${panel.length} exceeds maxPanel=${maxPanel} \u2014 rejecting before fan-out (#1905)`
    );
    return errorResponse(
      400,
      `Fusion panel too large (${panel.length} models, max ${maxPanel}) \u2014 reduce the combo's target count or raise fusionTuning.maxPanel`
    );
  }
  const cfg = {
    minPanel: tuning?.minPanel ?? FUSION_DEFAULTS.minPanel,
    stragglerGraceMs: tuning?.stragglerGraceMs ?? FUSION_DEFAULTS.stragglerGraceMs,
    panelHardTimeoutMs: tuning?.panelHardTimeoutMs ?? FUSION_DEFAULTS.panelHardTimeoutMs
  };
  const { tools: _tools, tool_choice: _tc, ...rest } = body;
  void _tools;
  void _tc;
  const panelBody = { ...rest, stream: false };
  let panelToDispatch = panel;
  if (perTargetAdmission) {
    const gates = await Promise.all(
      panel.map(async (target) => ({
        target,
        ok: await perTargetAdmission({
          modelStr: getFusionModelString(target),
          executionKey: typeof target === "string" ? target : target.executionKey,
          body: panelBody
        })
      }))
    );
    const dropped = gates.filter((g) => !g.ok);
    if (dropped.length > 0) {
      log.info(
        "FUSION",
        `Skipping ${dropped.length} panel member(s) \u2014 admission lane full: ${dropped.map((g) => getFusionModelString(g.target)).join(", ")}`
      );
    }
    panelToDispatch = gates.filter((g) => g.ok).map((g) => g.target);
    if (panelToDispatch.length === 0) {
      log.warn("FUSION", "All panel members skipped by admission lanes \u2014 nothing to fan out");
      return errorResponse(503, "All fusion panel members were skipped by admission lanes");
    }
  }
  const minPanel = Math.min(Math.max(1, cfg.minPanel), panelToDispatch.length);
  const hasExplicitJudge = Boolean(judgeModel && judgeModel.trim());
  const judge = hasExplicitJudge ? judgeModel.trim() : getFusionModelString(panelToDispatch[0]);
  log.info(
    "FUSION",
    `Combo "${comboName ?? ""}" | panel=${panelToDispatch.length} [${panelToDispatch.map(getFusionModelString).join(", ")}] | judge=${judge} | quorum=${minPanel}`
  );
  if (isToolBearingRequest(body)) {
    log.info(
      "FUSION",
      `Combo "${comboName ?? ""}" received a tool-bearing request \u2014 bypassing panel synthesis, routing directly to ${judge} with tools intact`
    );
    return handleSingleModel(body, judge);
  }
  const t0 = Date.now();
  const calls = panelToDispatch.map(
    (target) => withTimeout(dispatchFusionModel(handleSingleModel, panelBody, target), cfg.panelHardTimeoutMs)
  );
  const settled = await collectPanel(calls, { ...cfg, minPanel });
  log.info("FUSION", `fan-out collected in ${Date.now() - t0}ms`);
  const answers = [];
  const failures = [];
  for (let i = 0; i < settled.length; i++) {
    const res = settled[i];
    const model = getFusionModelString(panelToDispatch[i]);
    if (!res) {
      log.warn("FUSION", `Panel ${model} dropped (straggler/timeout)`);
      failures.push({ model, reason: "straggler_dropped" });
      continue;
    }
    const sentinel = res;
    if (sentinel.__timeout) {
      log.warn("FUSION", `Panel ${model} timed out`);
      failures.push({ model, reason: "timeout" });
      continue;
    }
    if (sentinel.__error) {
      log.warn("FUSION", `Panel ${model} threw`, {
        error: sanitizeErrorMessage(sentinel.__error)
      });
      failures.push({ model, reason: "threw" });
      continue;
    }
    const resp = res;
    if (!resp.ok) {
      failures.push({ model, reason: `status_${resp.status}` });
      log.warn("FUSION", `Panel ${model} ${resp.status === 429 ? "rate-limited" : "failed"}`, {
        status: resp.status
      });
      continue;
    }
    try {
      const json = await resp.clone().json();
      const text = extractPanelText(json);
      if (text) {
        answers.push({ model, text });
        log.info("FUSION", `Panel ${model} ok (${text.length} chars)`);
      } else {
        log.warn("FUSION", `Panel ${model} returned empty content`);
        failures.push({ model, reason: "empty_content" });
      }
    } catch (e) {
      log.warn("FUSION", `Panel ${model} unparseable`, {
        error: sanitizeErrorMessage(e)
      });
      failures.push({ model, reason: "unparseable" });
    }
  }
  if (answers.length === 0) {
    const detail = failures.map((f) => `${f.model}=${f.reason}`).join(", ");
    log.warn("FUSION", `No live models: ${detail}`);
    return errorResponse(
      503,
      detail ? `All fusion panel models failed: ${detail}` : "All fusion panel models failed"
    );
  }
  if (answers.length === 1) {
    if (!hasExplicitJudge) {
      log.info("FUSION", `Only ${answers[0].model} succeeded \u2014 answering directly (no fusion)`);
      return handleSingleModel(body, answers[0].model);
    }
  }
  const effectiveJudge = hasExplicitJudge ? judge : answers.some((a) => a.model === getFusionModelString(panel[0])) ? getFusionModelString(panel[0]) : answers[0].model;
  if (answers.length === 1) {
    log.info(
      "FUSION",
      `Only ${answers[0].model} succeeded \u2014 judging single answer with ${effectiveJudge}`
    );
  }
  const judgeBody = appendUserTurn(body, buildJudgePrompt(answers));
  log.info("FUSION", `Judging ${answers.length} answers with ${effectiveJudge}`);
  return judgeTarget ? handleSingleModel(judgeBody, judgeTarget.modelStr, judgeTarget) : handleSingleModel(judgeBody, effectiveJudge);
}
export {
  FUSION_DEFAULTS,
  appendUserTurn,
  buildJudgePrompt,
  collectPanel,
  extractPanelText,
  handleFusionChat,
  isToolBearingRequest
};
