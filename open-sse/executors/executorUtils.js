// Small shared helpers ported from OmniRoute executors/base.ts (used by web executors).

export function setUserAgentHeader(headers, userAgent) {
  headers["User-Agent"] = userAgent;
  if ("user-agent" in headers) {
    headers["user-agent"] = userAgent;
  }
}

export function mergeUpstreamExtraHeaders(headers, extra) {
  if (!extra) return;
  for (const [k, v] of Object.entries(extra)) {
    if (typeof k === "string" && k.length > 0 && typeof v === "string") {
      if (k.toLowerCase() === "user-agent") {
        setUserAgentHeader(headers, v);
        continue;
      }
      headers[k] = v;
    }
  }
}

export function mergeAbortSignals(primary, secondary) {
  const controller = new AbortController();
  const abortFrom = (source) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  if (primary.aborted) {
    abortFrom(primary);
    return controller.signal;
  }
  if (secondary.aborted) {
    abortFrom(secondary);
    return controller.signal;
  }
  const abortPrimary = () => abortFrom(primary);
  const abortSecondary = () => abortFrom(secondary);
  primary.addEventListener("abort", abortPrimary, { once: true });
  secondary.addEventListener("abort", abortSecondary, { once: true });
  const signal = controller.signal;
  signal.addEventListener(
    "abort",
    () => {
      primary.removeEventListener("abort", abortPrimary);
      secondary.removeEventListener("abort", abortSecondary);
    },
    { once: true }
  );
  return signal;
}
