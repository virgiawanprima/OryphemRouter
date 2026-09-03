import { discoverRepeatedNoise, discoverNormalizeLine } from "./discover.js";
const DROP_THRESHOLD_RATIO = 0.5;
const ERROR_PATTERN = /(?:\bERR!|\berror\s*[:/]|\bfailed?\b|\bfailure\b|\bcritical\b|\bexception\b|\bfatal\b|\bpanic\b)/i;
const SUMMARY_PATTERN = /(?:\bsuccess(?:ful(?:ly)?)?\b|\bdone\b|\bcomplete(?:d)?\b|\bbuilt\b|\badded\b|\binstalled\b|\bfinished?\b|\bpassed?\b)/i;
function commandToId(command) {
  return command.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function commandToMatchPattern(command) {
  const parts = command.trim().split(/\s+/);
  const escaped = parts.map((p) => p.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&"));
  return `^${escaped.join("\\s+")}\\b`;
}
function matchesAny(line, patterns) {
  for (const p of patterns) {
    try {
      if (new RegExp(p, "i").test(line)) return true;
    } catch {
    }
  }
  return false;
}
function suggestFilter(command, samples) {
  const id = commandToId(command) || "unknown";
  const commandPattern = commandToMatchPattern(command);
  const totalSamples = samples.length;
  if (totalSamples === 0) {
    return {
      id: `suggested-${id}`,
      label: command,
      description: `Auto-suggested filter for '${command}' (0 samples \u2014 no rules derived).`,
      category: "generic",
      priority: 50,
      match: { outputTypes: [], commands: [commandPattern], patterns: [] },
      rules: {
        stripAnsi: true,
        dropPatterns: [],
        collapsePatterns: [],
        includePatterns: [],
        deduplicate: true,
        maxLines: 200,
        headLines: 30,
        tailLines: 40,
        onEmpty: `${id}: ok`
      },
      preserve: { errorPatterns: [], summaryPatterns: [] },
      _meta: { learnedFromSamples: 0, dropThreshold: DROP_THRESHOLD_RATIO }
    };
  }
  const noiseCandidates = discoverRepeatedNoise(samples);
  const dropThresholdHits = Math.max(2, Math.ceil(totalSamples * DROP_THRESHOLD_RATIO));
  const errorNorms = /* @__PURE__ */ new Set();
  const summaryNorms = /* @__PURE__ */ new Set();
  for (const sample of samples) {
    for (const raw of sample.output.split(/\r?\n/)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const norm = discoverNormalizeLine(trimmed);
      if (!norm) continue;
      if (ERROR_PATTERN.test(trimmed)) {
        errorNorms.add(norm);
      } else if (SUMMARY_PATTERN.test(trimmed)) {
        summaryNorms.add(norm);
      }
    }
  }
  function normsToPatterns(norms) {
    return Array.from(norms).map((norm) => {
      const escaped = norm.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
      const withWildcards = escaped.replace(/<N>/g, "[\\S]+").replace(/<PKG>/g, "[\\S]+").replace(/<CODE>/g, "[A-Z][A-Z0-9]+");
      return withWildcards;
    });
  }
  const errorPatterns = normsToPatterns(errorNorms);
  const summaryPatterns = normsToPatterns(summaryNorms);
  const allPreservePatterns = [...errorPatterns, ...summaryPatterns];
  const preservedRawLines = [];
  for (const sample of samples) {
    for (const raw of sample.output.split(/\r?\n/)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (matchesAny(trimmed, allPreservePatterns)) {
        preservedRawLines.push(trimmed);
      }
    }
  }
  const dropPatterns = [];
  for (const candidate of noiseCandidates) {
    if (candidate.hits < dropThresholdHits) continue;
    const conflictsWithPreserve = preservedRawLines.some((line) => {
      try {
        return new RegExp(candidate.pattern, "i").test(line);
      } catch {
        return false;
      }
    });
    if (conflictsWithPreserve) continue;
    dropPatterns.push(candidate.pattern);
  }
  return {
    id: `suggested-${id}`,
    label: command,
    description: `Auto-suggested filter for '${command}' learned from ${totalSamples} sample(s).`,
    category: "generic",
    priority: 50,
    match: { outputTypes: [], commands: [commandPattern], patterns: [] },
    rules: {
      stripAnsi: true,
      dropPatterns,
      collapsePatterns: [],
      includePatterns: [...errorPatterns, ...summaryPatterns],
      deduplicate: true,
      maxLines: 200,
      headLines: 30,
      tailLines: 40,
      onEmpty: `${id}: ok`
    },
    preserve: { errorPatterns, summaryPatterns },
    _meta: { learnedFromSamples: totalSamples, dropThreshold: DROP_THRESHOLD_RATIO }
  };
}
export {
  commandToId,
  suggestFilter
};
