// ADAPTED STUB — deep app infra (compression/stats.ts).
export function estimateCompressionTokens(text, _opts) {
  const str = typeof text === "string" ? text : String(text ?? "");
  return Math.ceil(str.length / 4);
}
