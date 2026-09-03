function stageTrace(label, extra, ctx) {
  const { traceEnabled, startTime, traceId, log } = ctx;
  if (!traceEnabled) return;
  const elapsed = Date.now() - startTime;
  let suffix = "";
  if (extra) {
    try {
      suffix = ` ${JSON.stringify(extra)}`;
    } catch {
      suffix = " [unserializable]";
    }
  }
  log?.info?.("STAGE_TRACE", `${traceId} ${label} t=${elapsed}ms${suffix}`);
}
export {
  stageTrace
};
