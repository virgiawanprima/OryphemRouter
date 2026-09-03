const CODEX_SPARK_MODEL_ID = "gpt-5.3-codex-spark";
const CODEX_SPARK_DISPLAY_NAME = "GPT-5.3-Codex-Spark";
const CODEX_SPARK_METERED_FEATURE = "gpt_5_3_codex_spark";
const CODEX_SPARK_QUOTA_SESSION = `${CODEX_SPARK_METERED_FEATURE}_session`;
const CODEX_SPARK_QUOTA_WEEKLY = `${CODEX_SPARK_METERED_FEATURE}_weekly`;
const CODEX_SCOPE_PATTERNS = [
  { pattern: "codex-spark", scope: "spark" },
  { pattern: "spark", scope: "spark" },
  { pattern: "bengalfox", scope: "spark" },
  { pattern: "codex", scope: "codex" },
  { pattern: "gpt-5", scope: "codex" }
];
function getCodexModelScope(model) {
  const lower = String(model || "").toLowerCase();
  for (const { pattern, scope } of CODEX_SCOPE_PATTERNS) {
    if (lower.includes(pattern)) return scope;
  }
  return "codex";
}
function getCodexRateLimitKey(accountId, model) {
  return `${accountId}:${getCodexModelScope(model)}`;
}
function isCodexSparkQuotaKey(key) {
  const normalized = String(key || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === CODEX_SPARK_QUOTA_SESSION || normalized === CODEX_SPARK_QUOTA_WEEKLY || normalized === "codex-spark" || normalized === "codex-spark-weekly" || normalized.includes("codex-spark") || normalized.includes("codex_spark") || normalized.includes(CODEX_SPARK_METERED_FEATURE);
}
function isCodexSparkLimitDescriptor(...values) {
  return values.some((value) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return normalized.includes("spark") || normalized.includes("bengalfox") || normalized.includes(CODEX_SPARK_METERED_FEATURE);
  });
}
function getCodexQuotaWindowFilterForModel(model) {
  if (!model) return void 0;
  const scope = getCodexModelScope(model);
  return (windowName) => {
    const isSpark = isCodexSparkQuotaKey(windowName);
    return scope === "spark" ? isSpark : !isSpark;
  };
}
function toCodexScopedQuotaWindowName(baseWindowName, model) {
  if (!model || getCodexModelScope(model) !== "spark") return baseWindowName;
  const normalized = baseWindowName.trim().toLowerCase();
  if (normalized === "session") return CODEX_SPARK_QUOTA_SESSION;
  if (normalized === "weekly") return CODEX_SPARK_QUOTA_WEEKLY;
  return baseWindowName;
}
function toCodexBaseQuotaWindowName(windowName) {
  if (!windowName) return windowName;
  const normalized = windowName.trim().toLowerCase();
  if (normalized === CODEX_SPARK_QUOTA_SESSION || normalized === "codex-spark") return "session";
  if (normalized === CODEX_SPARK_QUOTA_WEEKLY || normalized === "codex-spark-weekly") {
    return "weekly";
  }
  return windowName;
}
export {
  CODEX_SPARK_DISPLAY_NAME,
  CODEX_SPARK_METERED_FEATURE,
  CODEX_SPARK_MODEL_ID,
  CODEX_SPARK_QUOTA_SESSION,
  CODEX_SPARK_QUOTA_WEEKLY,
  getCodexModelScope,
  getCodexQuotaWindowFilterForModel,
  getCodexRateLimitKey,
  isCodexSparkLimitDescriptor,
  isCodexSparkQuotaKey,
  toCodexBaseQuotaWindowName,
  toCodexScopedQuotaWindowName
};
