function recordContextEditingTelemetryHook(args) {
  const { contextEditingEnabled, provider, responseBody, skillRequestId, log } = args;
  if (!contextEditingEnabled || provider !== "claude") return;
  void (async () => {
    try {
      const { extractContextEditingTelemetry } = await import("../../config/contextEditing.ts");
      const tele = extractContextEditingTelemetry(responseBody);
      if (tele) {
        const { recordContextEditingTelemetry } = await import("@/lib/db/compressionAnalytics");
        recordContextEditingTelemetry(skillRequestId, tele, provider);
        log?.debug?.(
          "CONTEXT_EDITING",
          `cleared ${tele.clearedInputTokens} input tokens / ${tele.clearedToolUses} tool uses (${tele.editCount} edits)`
        );
      }
    } catch {
    }
  })();
}
export {
  recordContextEditingTelemetryHook
};
