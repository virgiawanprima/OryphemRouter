import {
  QUANTUM_PATTERNS,
  TAIL_DELIM,
  placeholderFor
} from "./quantumPatterns.js";
import { detectVolatileSpans } from "./quantumLock.js";
import { applyQuantumLock } from "./quantumLockStep.js";
import {
  resolveQuantumLock,
  quantumCachingContext,
  withQuantumLock,
  withQuantumLockAsync
} from "./strategyWrap.js";
export {
  QUANTUM_PATTERNS,
  TAIL_DELIM,
  applyQuantumLock,
  detectVolatileSpans,
  placeholderFor,
  quantumCachingContext,
  resolveQuantumLock,
  withQuantumLock,
  withQuantumLockAsync
};
