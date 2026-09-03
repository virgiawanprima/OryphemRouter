// ADAPTATION for OryphemRouter.
// OmniRoute's `src/lib/logEnv.ts` derives log format/level from env vars (and sets up file
// logging under DATA_DIR — deep app infra). This minimal version only exposes the two
// getters `open-sse/utils/logger.js` consumes.

export function getAppLogLevel() {
  const raw = (process.env.APP_LOG_LEVEL ?? "info").toLowerCase();
  return ["debug", "info", "warn", "error"].includes(raw) ? raw : "info";
}

export function getAppLogFormat() {
  const raw = (process.env.APP_LOG_FORMAT ?? "text").toLowerCase();
  return raw === "json" ? "json" : "text";
}
