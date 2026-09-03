import { createHash } from "node:crypto";
const KINDS = ["tool-output-json", "logs", "code", "prose", "multi-turn"];
const PII_PATTERNS = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  // email
  /\b\d{3}-\d{2}-\d{4}\b/,
  // US SSN shape
  /\b(?:\d[ -]*?){13,16}\b/
  // card-number shape
];
function looksLikePII(text) {
  return PII_PATTERNS.some((re) => re.test(text));
}
function loadCorpus(rawCases) {
  return rawCases.map((c) => {
    if (!c.id || !c.context || !c.question) {
      throw new Error(`eval corpus: case "${c.id ?? "?"}" missing id/context/question`);
    }
    if (!KINDS.includes(c.kind)) {
      throw new Error(`eval corpus: case "${c.id}" has unknown kind "${c.kind}"`);
    }
    if (c.captured === true && looksLikePII(c.context)) {
      throw new Error(`eval corpus: captured case "${c.id}" contains an obvious PII marker \u2014 anonymize before ingestion`);
    }
    return c;
  });
}
function hashCorpus(cases) {
  const canonical = cases.map((c) => JSON.stringify([c.id, c.kind, c.context, c.question, c.gold ?? null])).sort().join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}
export {
  hashCorpus,
  loadCorpus
};
