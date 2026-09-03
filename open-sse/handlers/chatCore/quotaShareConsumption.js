async function scheduleQuotaShareConsumption(args) {
  if (!args.apiKeyId || !args.connectionId) return;
  try {
    const { scheduleRecordConsumption, buildConsumptionCost } = await import("@/lib/quota/spendRecorder");
    scheduleRecordConsumption(
      {
        apiKeyId: args.apiKeyId,
        connectionId: args.connectionId,
        provider: args.provider ?? "unknown",
        // Per-(key,model) cap accounting — same resolved model id used at enforce time.
        model: args.model ?? void 0,
        cost: buildConsumptionCost(args.usage, args.estimatedCost)
      },
      args.log
    );
  } catch (_) {
  }
}
export {
  scheduleQuotaShareConsumption
};
