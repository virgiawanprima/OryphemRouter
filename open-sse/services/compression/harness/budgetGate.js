function tokensPerTask(report) {
  const byTask = /* @__PURE__ */ new Map();
  for (const r of report.results) {
    const entry = byTask.get(r.task) ?? { tokens: 0, count: 0 };
    entry.tokens += r.compressedTokens;
    entry.count += 1;
    byTask.set(r.task, entry);
  }
  const out = {};
  for (const [task, { tokens, count }] of byTask) {
    out[task] = Math.round(tokens / count);
  }
  return out;
}
function checkTokensPerTaskGate(report, baseline, tolerancePercent = 2) {
  const current = tokensPerTask(report);
  const regressions = [];
  for (const [task, base] of Object.entries(baseline.tasks)) {
    const cur = current[task];
    if (cur === void 0 || base <= 0) continue;
    const deltaPercent = Math.round((cur - base) / base * 1e3) / 10;
    if (deltaPercent > tolerancePercent) {
      regressions.push({ task, baseline: base, current: cur, deltaPercent });
    }
  }
  return { passed: regressions.length === 0, regressions, tolerancePercent };
}
export {
  checkTokensPerTaskGate,
  tokensPerTask
};
