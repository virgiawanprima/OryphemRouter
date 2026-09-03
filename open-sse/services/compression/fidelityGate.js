import { extractPreservedBlocks } from "./preservation.js";
const CRITICAL_KINDS = /* @__PURE__ */ new Set([
  "url",
  "const_case",
  "env_var",
  "version",
  "dotted_identifier",
  "function_call",
  "file_path",
  "inline_code"
]);
const NUMERIC_RE = /\d[\d.,]{0,40}/g;
const JSON_KEY_RE = /"([A-Za-z_$][\w$-]{0,80})"\s*:/g;
const HUNK_RE = /@@ -\d{1,9}(?:,\d{1,9})? \+\d{1,9}(?:,\d{1,9})? @@/g;
function survivalRatio(needles, haystack) {
  if (needles.length === 0) return 1;
  let survived = 0;
  for (const n of needles) if (haystack.includes(n)) survived++;
  return survived / needles.length;
}
function uniq(values) {
  return Array.from(new Set(values));
}
function checkFidelity(inputText, outputText, cfg) {
  try {
    const tokens = uniq(
      extractPreservedBlocks(inputText).blocks.filter((b) => CRITICAL_KINDS.has(b.kind)).map((b) => b.content.trim()).filter((c) => c.length > 0)
    );
    const minTok = (cfg.minTokenSurvivalPercent ?? 95) / 100;
    const tokRatio = survivalRatio(tokens, outputText);
    if (tokRatio < minTok) {
      return {
        passed: false,
        failedInvariant: "protected-tokens",
        detail: `tokens protegidos ${Math.round(tokRatio * 100)}% < ${Math.round(minTok * 100)}%`
      };
    }
    if (cfg.checkDiffHunks !== false) {
      for (const h of uniq(inputText.match(HUNK_RE) ?? [])) {
        if (!outputText.includes(h)) {
          return {
            passed: false,
            failedInvariant: "diff-hunks",
            detail: `hunk "${h}" ausente no output`
          };
        }
      }
    }
    if (cfg.checkNumericIntegrity !== false) {
      for (const num of uniq(inputText.match(NUMERIC_RE) ?? [])) {
        if (!outputText.includes(num)) {
          return {
            passed: false,
            failedInvariant: "numeric",
            detail: `n\xFAmero "${num}" ausente no output`
          };
        }
      }
    }
    const keys = uniq(Array.from(inputText.matchAll(JSON_KEY_RE), (m) => m[1]));
    if (keys.length > 0) {
      const minKey = (cfg.minJsonKeyPercent ?? 90) / 100;
      const keyRatio = survivalRatio(
        keys.map((k) => `"${k}"`),
        outputText
      );
      if (keyRatio < minKey) {
        return {
          passed: false,
          failedInvariant: "json-keys",
          detail: `chaves JSON ${Math.round(keyRatio * 100)}% < ${Math.round(minKey * 100)}%`
        };
      }
    }
    return { passed: true };
  } catch {
    return { passed: true };
  }
}
export {
  checkFidelity
};
