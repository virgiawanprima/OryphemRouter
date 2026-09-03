import { selectCompressionPlan, applyCompressionAsync } from "../strategySelector.js";
import { estimateCompressionTokens } from "../stats.js";
import { loadCorpus, hashCorpus } from "./corpus.js";
import { buildJudgePrompt, parseJudgeVerdict, runSelfTest } from "./judge.js";
import { buildGradePrompt, parseGradeVerdict } from "./grader.js";
import { computeSavings } from "./savings.js";
import { createCostMeter } from "./costMeter.js";
import { aggregateRecords } from "./aggregate.js";
function buildBody(context, question) {
  return { messages: [{ role: "user", content: `${context}

Question: ${question}` }] };
}
function answerText(body) {
  const messages = body.messages ?? [];
  return messages.map((m) => typeof m.content === "string" ? m.content : "").join("\n");
}
async function runEval(opts) {
  const corpus = loadCorpus(opts.corpus);
  const selfTest = await runSelfTest(opts.client, opts.judgeModel);
  if (!selfTest.passed) {
    return { aborted: true, abortReason: `judge self-test failed: ${selfTest.detail}`, report: null };
  }
  const limit = typeof opts.sample === "number" ? Math.max(0, opts.sample) : corpus.length;
  const cases = corpus.slice(0, limit);
  const meter = createCostMeter(opts.costCapUsd);
  const records = [];
  let partial = false;
  for (const c of cases) {
    if (meter.exceeded) {
      partial = true;
      break;
    }
    const fullBody = buildBody(c.context, c.question);
    try {
      const full = await opts.client.complete(opts.answerModel, [{ role: "user", content: answerText(fullBody) }]);
      meter.add(full.usdCost ?? 0);
      const estimatedTokens = estimateCompressionTokens(fullBody);
      const plan = selectCompressionPlan(opts.config, opts.comboId, estimatedTokens, fullBody, void 0, opts.combos);
      const compressedResult = await applyCompressionAsync(fullBody, plan.mode, {
        config: opts.config,
        model: opts.answerModel
      });
      const compressedBody = compressedResult.compressed ? compressedResult.body : fullBody;
      const compressed = await opts.client.complete(opts.answerModel, [{ role: "user", content: answerText(compressedBody) }]);
      meter.add(compressed.usdCost ?? 0);
      const judge = await opts.client.complete(opts.judgeModel, buildJudgePrompt(full.text, compressed.text));
      meter.add(judge.usdCost ?? 0);
      const fidelity = parseJudgeVerdict(judge.text);
      let goldFull = null;
      let goldCompressed = null;
      if (typeof c.gold === "string") {
        const gf = await opts.client.complete(opts.judgeModel, buildGradePrompt(full.text, c.gold));
        meter.add(gf.usdCost ?? 0);
        const gc = await opts.client.complete(opts.judgeModel, buildGradePrompt(compressed.text, c.gold));
        meter.add(gc.usdCost ?? 0);
        goldFull = parseGradeVerdict(gf.text).correct;
        goldCompressed = parseGradeVerdict(gc.text).correct;
      }
      records.push({
        id: c.id,
        kind: c.kind,
        fidelity,
        goldFull,
        goldCompressed,
        savings: computeSavings(fullBody, compressedBody, opts.costPerKTokenIn),
        errored: false
      });
    } catch (err) {
      records.push({
        id: c.id,
        kind: c.kind,
        fidelity: "unparseable",
        goldFull: null,
        goldCompressed: null,
        savings: { tokensBefore: 0, tokensAfter: 0, ratio: 1 },
        errored: true,
        errorDetail: err instanceof Error ? err.message : String(err)
      });
    }
    if (meter.exceeded) {
      partial = true;
      break;
    }
  }
  const stamps = {
    answerModel: opts.answerModel,
    judgeModel: opts.judgeModel,
    corpusHash: hashCorpus(corpus),
    sampleSize: typeof opts.sample === "number" ? opts.sample : "all"
  };
  const report = aggregateRecords(records, stamps, { partial, totalCostUsd: meter.spent });
  return { aborted: false, report };
}
export {
  runEval
};
