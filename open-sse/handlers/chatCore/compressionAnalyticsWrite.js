function buildRtkPointerFields(rtkPointers) {
  return {
    rtk_raw_output_pointer: rtkPointers[0]?.id ?? null,
    rtk_raw_output_bytes: rtkPointers[0]?.bytes ?? null,
    rtk_raw_output_pointers: rtkPointers.length ? JSON.stringify(rtkPointers.map((pointer) => pointer.id)) : null,
    rtk_raw_output_total_bytes: rtkPointers.length ? rtkPointers.reduce((total, pointer) => total + (pointer.bytes ?? 0), 0) : null
  };
}
function buildAnalyticsRow(opts, tokensSaved, rtkPointers, estimatedUsdSaved) {
  const { stats } = opts;
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    combo_id: opts.comboName ?? null,
    provider: opts.provider ?? null,
    mode: opts.mode,
    engine: stats.engine ?? opts.mode,
    compression_combo_id: stats.compressionComboId ?? opts.compressionComboId ?? null,
    original_tokens: stats.originalTokens,
    compressed_tokens: stats.compressedTokens,
    tokens_saved: tokensSaved,
    duration_ms: stats.durationMs ?? null,
    request_id: opts.skillRequestId,
    estimated_usd_saved: estimatedUsdSaved || null,
    validation_fallback: stats.fallbackApplied ? 1 : 0,
    output_mode: opts.cavemanOutputModeApplied ? opts.cavemanOutputModeIntensity : null,
    ...buildRtkPointerFields(rtkPointers)
  };
}
function buildEngineBreakdownRows(stats, requestId) {
  const engineBreakdown = stats.engineBreakdown ?? [];
  return engineBreakdown.map((b) => ({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    request_id: requestId,
    engine: b.engine,
    original_tokens: b.originalTokens,
    compressed_tokens: b.compressedTokens,
    tokens_saved: Math.max(0, b.originalTokens - b.compressedTokens),
    duration_ms: b.durationMs ?? null
  }));
}
function writeCompressionSkip(opts, skipReason) {
  return (async () => {
    try {
      const { insertCompressionAnalyticsRow } = await import("@/lib/db/compressionAnalytics");
      const { stats } = opts;
      insertCompressionAnalyticsRow({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        combo_id: opts.comboName ?? null,
        provider: opts.provider ?? null,
        mode: opts.mode,
        engine: stats.engine ?? opts.mode,
        compression_combo_id: stats.compressionComboId ?? opts.compressionComboId ?? null,
        original_tokens: stats.originalTokens,
        compressed_tokens: stats.compressedTokens,
        tokens_saved: 0,
        duration_ms: stats.durationMs ?? null,
        request_id: opts.skillRequestId,
        skip_reason: skipReason
      });
    } catch (err) {
      opts.log?.warn?.(
        "COMPRESSION",
        "Compression skip-analytics write skipped: " + (err instanceof Error ? err.message : String(err))
      );
    }
  })();
}
function writeCompressionAnalytics(opts, dependencies = {}) {
  return (async () => {
    try {
      const { insertCompressionAnalyticsRow, insertCompressionEngineBreakdown } = await import("@/lib/db/compressionAnalytics");
      const { stats } = opts;
      const tokensSaved = Math.max(0, stats.originalTokens - stats.compressedTokens);
      const rtkPointers = stats.rtkRawOutputPointers ?? [];
      let estimatedUsdSaved = 0;
      try {
        const calculateCost = dependencies.calculateCost ?? (await import("@/lib/usage/costCalculator")).calculateCost;
        estimatedUsdSaved = await calculateCost(
          opts.provider ?? "",
          opts.effectiveModel ?? "",
          { input: tokensSaved },
          { serviceTier: opts.effectiveServiceTier }
        );
      } catch (err) {
        opts.log?.debug?.(
          "COMPRESSION",
          "Compression cost estimate skipped: " + (err instanceof Error ? err.message : String(err))
        );
      }
      insertCompressionAnalyticsRow(
        buildAnalyticsRow(opts, tokensSaved, rtkPointers, estimatedUsdSaved)
      );
      const breakdownRows = buildEngineBreakdownRows(stats, opts.skillRequestId);
      if (breakdownRows.length > 0) {
        insertCompressionEngineBreakdown(breakdownRows);
      }
    } catch (err) {
      opts.log?.warn?.(
        "COMPRESSION",
        "Compression analytics write skipped: " + (err instanceof Error ? err.message : String(err))
      );
    }
  })();
}
export {
  writeCompressionAnalytics,
  writeCompressionSkip
};
