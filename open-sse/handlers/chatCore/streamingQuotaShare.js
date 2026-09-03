function scheduleStreamingQuotaShareConsumption(args) {
  if (!args.apiKeyId || !args.connectionId || args.streamStatus !== 200) return;
  const quotaApiKeyId = args.apiKeyId;
  const quotaConnectionId = args.connectionId;
  import("@/lib/quota/spendRecorder").then(
    ({ recordStreamingConsumption }) => recordStreamingConsumption(
      {
        apiKeyId: quotaApiKeyId,
        connectionId: quotaConnectionId,
        provider: args.provider,
        model: args.model,
        streamUsage: args.streamUsage,
        streamStatus: args.streamStatus,
        serviceTier: args.serviceTier
      },
      { calculateCost: args.calculateCost, log: args.log }
    )
  ).catch(() => {
  });
}
export {
  scheduleStreamingQuotaShareConsumption
};
