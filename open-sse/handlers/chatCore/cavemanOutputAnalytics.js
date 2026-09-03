function writeCavemanOutputAnalytics(args) {
  return (async () => {
    try {
      const { insertCompressionAnalyticsRow } = await import("@/lib/db/compressionAnalytics");
      insertCompressionAnalyticsRow({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        combo_id: args.comboName ?? null,
        provider: args.provider ?? null,
        mode: "output-caveman",
        engine: "caveman-output",
        compression_combo_id: args.compressionComboId ?? null,
        original_tokens: args.estimatedTokens,
        compressed_tokens: args.estimatedTokens,
        tokens_saved: 0,
        request_id: args.skillRequestId,
        output_mode: args.cavemanOutputModeIntensity
      });
    } catch (err) {
      args.log?.warn?.(
        "COMPRESSION",
        "Caveman output analytics write skipped: " + (err instanceof Error ? err.message : String(err))
      );
    }
  })();
}
export {
  writeCavemanOutputAnalytics
};
