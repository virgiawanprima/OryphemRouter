import { detectCachingContext } from "../cachingAware.js";
import { applyQuantumLock } from "./quantumLockStep.js";
function resolveQuantumLock(options) {
  const ql = options?.config?.quantumLock;
  return ql?.enabled ? ql : void 0;
}
function quantumCachingContext(body, options) {
  const ctx = detectCachingContext(body, options?.cachingContext ?? { model: options?.model });
  return { isCachingProvider: ctx.isCachingProvider };
}
function attachQuantumLockStats(result, qlStats) {
  if (result.stats) {
    result.stats.quantumLock = qlStats;
    return result;
  }
  const carrier = {
    originalTokens: 0,
    compressedTokens: 0,
    savingsPercent: 0,
    techniquesUsed: ["quantum-lock"],
    mode: "off",
    timestamp: Date.now(),
    quantumLock: qlStats
  };
  return { ...result, stats: carrier };
}
function withQuantumLock(body, ql, ctx, run) {
  if (!ql || !ctx.isCachingProvider) return run(body);
  const { body: locked, stats } = applyQuantumLock(body, ql, ctx);
  const result = run(locked);
  if (stats.fragments > 0) return attachQuantumLockStats(result, stats);
  return result;
}
async function withQuantumLockAsync(body, ql, ctx, run) {
  if (!ql || !ctx.isCachingProvider) return run(body);
  const { body: locked, stats } = applyQuantumLock(body, ql, ctx);
  const result = await run(locked);
  if (stats.fragments > 0) return attachQuantumLockStats(result, stats);
  return result;
}
export {
  quantumCachingContext,
  resolveQuantumLock,
  withQuantumLock,
  withQuantumLockAsync
};
