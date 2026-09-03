// ADAPTED STUB (was @/sse/utils/logger). Console-based graceful fallback.
function out(level, scope, message, meta) {
  try {
    const prefix = scope ? "[" + scope + "]" : "";
    const line = `${level} ${prefix} ${typeof message === "string" ? message : JSON.stringify(message)}`;
    if (level === "ERROR") console.error(line, meta ?? "");
    else if (level === "WARN") console.warn(line, meta ?? "");
    else console.log(line, meta ?? "");
  } catch {}
}
export const logger = {
  info: (scope, message, meta) => out("INFO", scope, message, meta),
  warn: (scope, message, meta) => out("WARN", scope, message, meta),
  error: (scope, message, meta) => out("ERROR", scope, message, meta),
  debug: (scope, message, meta) => out("DEBUG", scope, message, meta),
};
export const info = (scope, message, meta) => out("INFO", scope, message, meta);
export const warn = (scope, message, meta) => out("WARN", scope, message, meta);
export const error = (scope, message, meta) => out("ERROR", scope, message, meta);
export const debug = (scope, message, meta) => out("DEBUG", scope, message, meta);
export const log = (scope, message, meta) => out("INFO", scope, message, meta);
export const defaultLogger = logger;
export default logger;
