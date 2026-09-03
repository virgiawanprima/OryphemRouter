function recordCompressionCacheStats(args) {
  void (async () => {
    try {
      const { detectCachingContext } = await import("../../services/compression/cachingAware.ts");
      const { recordCacheStats } = await import("@/lib/db/compressionCacheStats");
      const cacheContext = detectCachingContext(args.compressionInputBody, {
        provider: args.provider,
        targetFormat: args.targetFormat,
        model: args.effectiveModel,
        connectionCacheOverride: args.connectionCacheOverride ?? null
      });
      const tokensSavedCompression = Math.max(
        0,
        args.stats.originalTokens - args.stats.compressedTokens
      );
      recordCacheStats({
        provider: cacheContext.provider ?? args.provider ?? "unknown",
        model: args.effectiveModel ?? "",
        compressionMode: args.mode,
        cacheControlPresent: cacheContext.hasCacheControl,
        estimatedCacheHit: cacheContext.hasCacheControl && cacheContext.isCachingProvider,
        tokensSavedCompression,
        tokensSavedCaching: 0,
        netSavings: tokensSavedCompression
      });
    } catch (err) {
      args.log?.debug?.(
        "COMPRESSION",
        "Compression cache stats write skipped: " + (err instanceof Error ? err.message : String(err))
      );
    }
  })();
}
export {
  recordCompressionCacheStats
};
