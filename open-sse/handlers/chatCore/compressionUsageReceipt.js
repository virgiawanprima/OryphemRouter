function attachCompressionUsageReceiptAfterAnalytics(usage, source, ctx) {
  const { pendingWrite, skillRequestId } = ctx;
  void (async () => {
    try {
      if (pendingWrite) await pendingWrite;
      const { attachCompressionUsageReceipt } = await import("@/lib/db/compressionAnalytics.ts");
      attachCompressionUsageReceipt(skillRequestId, usage, source);
    } catch {
    }
  })();
}
export {
  attachCompressionUsageReceiptAfterAnalytics
};
