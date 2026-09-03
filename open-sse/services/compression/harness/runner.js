import { measureCompression } from "./measure.js";
async function runCompressionEval(corpus, compress) {
  const results = [];
  for (const item of corpus) {
    const compressed = await compress(item.input);
    results.push({
      id: item.id,
      task: item.task ?? item.id,
      ...measureCompression(item.input, compressed)
    });
  }
  const n = results.length || 1;
  const meanSavingsPercent = results.reduce((s, r) => s + r.savingsPercent, 0) / n;
  const meanRetention = results.reduce((s, r) => s + r.retention.score, 0) / n;
  return {
    results,
    meanSavingsPercent: Math.round(meanSavingsPercent * 10) / 10,
    meanRetention: Math.round(meanRetention * 1e3) / 1e3,
    totalOriginalTokens: results.reduce((s, r) => s + r.originalTokens, 0),
    totalCompressedTokens: results.reduce((s, r) => s + r.compressedTokens, 0)
  };
}
export {
  runCompressionEval
};
