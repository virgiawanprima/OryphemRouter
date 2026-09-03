function buildGradePrompt(answer, gold) {
  return [
    {
      role: "system",
      content: "You are a strict grader. Decide whether the candidate answer is CORRECT with respect to the gold answer \u2014 judge meaning, not wording (a correctly-phrased-differently answer is CORRECT). Reply with exactly one final line: `VERDICT: CORRECT` or `VERDICT: INCORRECT`."
    },
    { role: "user", content: `Gold answer:
${gold}

Candidate answer:
${answer}` }
  ];
}
function parseGradeVerdict(raw) {
  const text = raw.toLowerCase();
  if (/\bincorrect\b/.test(text)) return { correct: false, raw };
  if (/\bcorrect\b/.test(text)) return { correct: true, raw };
  return { correct: false, raw };
}
export {
  buildGradePrompt,
  parseGradeVerdict
};
