function recordStreamingCost(args) {
  if (!args.apiKeyId || !args.streamUsage) return;
  const apiKeyId = args.apiKeyId;
  args.calculateCost(args.provider, args.model, args.streamUsage, { serviceTier: args.serviceTier }).then((estimatedCost) => {
    if (estimatedCost > 0) args.recordCost(apiKeyId, estimatedCost);
  }).catch(() => {
  });
}
export {
  recordStreamingCost
};
