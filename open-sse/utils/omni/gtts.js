// ADAPTED STUB (was executors/gtts.ts in OmniRoute).
export class GttsUpstreamError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "GttsUpstreamError";
    this.statusCode = statusCode;
  }
}
export function normalizeGttsLang(lang) {
  if (typeof lang !== "string" || !lang.trim()) return "en";
  return lang.trim().toLowerCase();
}
export async function synthesizeGtts() { throw new Error("synthesizeGtts not ported (stub)"); }
