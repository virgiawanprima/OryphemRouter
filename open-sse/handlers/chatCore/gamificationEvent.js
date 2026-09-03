async function emitRequestGamificationEvent(args) {
  if (!args.apiKeyId) return;
  try {
    const { emitGamificationEvent } = await import("@/lib/gamification/events");
    emitGamificationEvent({
      apiKeyId: args.apiKeyId,
      action: "request",
      metadata: { model: args.model, provider: args.provider }
    });
  } catch (_) {
  }
}
export {
  emitRequestGamificationEvent
};
