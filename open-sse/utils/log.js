// Lightweight structured logger for the engine (ported/engine code).
//
// Purpose: replace raw `console.log/warn/error` in request-path engine code so
// production logs are gated (no debug noise / accidental secret leakage), while
// dev/debug stays available.
//
// - Level from ORYPHEM_LOG_LEVEL (debug|info|warn|error); production default = warn+error.
// - Never logs credentials: pass plain values; use sanitize() for anything derived
//   from requests (tokens, keys, bodies).
import { sanitizeErrorMessage } from "./errorSanitize.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const current = LEVELS[String(process.env.ORYPHEM_LOG_LEVEL || "").toLowerCase()] ?? LEVELS.warn;

function ts() {
  return new Date().toISOString();
}

/** Strip obvious secrets from a value before logging (tokens, keys, bearer). */
export function sanitize(value) {
  if (typeof value !== "string") return value;
  return sanitizeErrorMessage(
    value
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
      .replace(/\b(sk|pk|rk|AKIA|ghp|gho|pplx|ai)-[A-Za-z0-9_-]{6,}/gi, "[redacted]")
  );
}

function emit(levelName, min, tag, args) {
  if (current > min) return;
  const prefix = `[${ts()}] [${levelName}]${tag ? ` [${tag}]` : ""}`;
  // eslint-disable-next-line no-console
  console[levelName === "error" ? "error" : levelName === "warn" ? "warn" : levelName === "info" ? "info" : "debug"](prefix, ...args);
}

export const log = {
  debug: (tag, ...args) => emit("debug", LEVELS.debug, tag, args),
  info: (tag, ...args) => emit("info", LEVELS.info, tag, args),
  warn: (tag, ...args) => emit("warn", LEVELS.warn, tag, args),
  error: (tag, ...args) => emit("error", LEVELS.error, tag, args),
};

export default log;
