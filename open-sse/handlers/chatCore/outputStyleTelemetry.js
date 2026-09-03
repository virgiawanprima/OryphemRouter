function emitOutputStyleTelemetry(args) {
  const result = args.outputStyleResult;
  if (!result) return;
  void (async () => {
    try {
      const { buildOutputStyleTelemetry } = await import("../../services/compression/outputStyles/telemetry.ts");
      const { insertCompressionRunTelemetryRow } = await import("@/lib/db/compressionRunTelemetry");
      const record = buildOutputStyleTelemetry({
        requestId: args.skillRequestId ?? args.traceId ?? "",
        model: args.effectiveModel ?? "",
        provider: args.provider ?? "",
        source: args.compressionComboId ? "active-profile" : "default",
        tokensBefore: args.estimatedTokens,
        tokensAfter: args.estimatedTokens,
        applied: result.applied,
        appliedStyles: result.appliedStyles,
        skippedReason: result.skippedReason
      });
      insertCompressionRunTelemetryRow(record);
    } catch (err) {
      args.log?.debug?.(
        "COMPRESSION",
        "Run-telemetry emit skipped: " + (err instanceof Error ? err.message : String(err))
      );
    }
  })();
}
export {
  emitOutputStyleTelemetry
};
