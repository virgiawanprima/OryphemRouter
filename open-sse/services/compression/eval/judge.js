function buildJudgePrompt(fullAnswer, compressedAnswer) {
  return [
    {
      role: "system",
      content: "You are a strict evaluation judge. You are given two answers to the same question: answer A produced from the full context, and answer B produced from a compressed context. Decide whether B MATERIALLY differs from A (a difference that changes the substance, correctness, or key facts \u2014 NOT mere wording/format). Reply with exactly one final line: `VERDICT: SAME` or `VERDICT: MATERIALLY_DIFFERS`."
    },
    {
      role: "user",
      content: `Answer A (full context):
${fullAnswer}

Answer B (compressed context):
${compressedAnswer}`
    }
  ];
}
function parseJudgeVerdict(raw) {
  const text = raw.toLowerCase();
  const differs = /materially[_\s-]*differs|differs[_\s]+materially|\bdiffers\b/.test(text);
  const same = /verdict:\s*same|\bsame\b/.test(text);
  if (differs) return "materially-differs";
  if (same) return "same";
  return "unparseable";
}
const CONTROL_PAIR = {
  reference: "The function returns 3 because the input is clamped to the upper bound.",
  good: "It returns 3 since the value is clamped to the maximum allowed.",
  degraded: "It returns 0 because the value is set to zero."
};
async function runSelfTest(client, judgeModel) {
  const goodVerdict = parseJudgeVerdict(
    (await client.complete(judgeModel, buildJudgePrompt(CONTROL_PAIR.reference, CONTROL_PAIR.good))).text
  );
  const degradedVerdict = parseJudgeVerdict(
    (await client.complete(judgeModel, buildJudgePrompt(CONTROL_PAIR.reference, CONTROL_PAIR.degraded))).text
  );
  if (degradedVerdict !== "materially-differs") {
    return { passed: false, detail: `judge failed to flag the known-degraded control (got "${degradedVerdict}")` };
  }
  if (goodVerdict !== "same") {
    return { passed: false, detail: `judge flagged the known-good control as "${goodVerdict}" (expected same)` };
  }
  return { passed: true, detail: "control pair ranked correctly" };
}
export {
  CONTROL_PAIR,
  buildJudgePrompt,
  parseJudgeVerdict,
  runSelfTest
};
