import { resolveRiskGate, withRiskGate } from "./riskGate/strategyWrap.js";
import {
  resolveQuantumLock,
  quantumCachingContext,
  withQuantumLock,
  withQuantumLockAsync
} from "./quantumLock/index.js";
function withCompressionEntrypointGuards(body, options, run) {
  return withQuantumLock(
    body,
    resolveQuantumLock(options),
    quantumCachingContext(body, options),
    (quantumBody) => withRiskGate(quantumBody, resolveRiskGate(options), (riskBody) => run(riskBody))
  );
}
function withCompressionEntrypointGuardsAsync(body, options, run) {
  return withQuantumLockAsync(
    body,
    resolveQuantumLock(options),
    quantumCachingContext(body, options),
    run
  );
}
export {
  withCompressionEntrypointGuards,
  withCompressionEntrypointGuardsAsync
};
