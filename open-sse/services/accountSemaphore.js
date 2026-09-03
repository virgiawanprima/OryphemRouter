const DEFAULT_TIMEOUT_MS = 3e4;
const DEFAULT_MAX_QUEUE_SIZE = 20;
const gates = /* @__PURE__ */ new Map();
function buildAccountSemaphoreKey({
  provider,
  accountKey
}) {
  return `${String(provider)}:${String(accountKey)}`;
}
function isBypassed(maxConcurrency) {
  return maxConcurrency == null || maxConcurrency <= 0;
}
function createNoopReleaseFn() {
  let released = false;
  return () => {
    if (released) return;
    released = true;
  };
}
function ensureGate(semaphoreKey, maxConcurrency) {
  const existing = gates.get(semaphoreKey);
  if (existing) {
    existing.maxConcurrency = maxConcurrency;
    return existing;
  }
  const created = {
    running: 0,
    maxConcurrency,
    queue: [],
    blockedUntil: null,
    cleanupTimer: null
  };
  gates.set(semaphoreKey, created);
  return created;
}
function isBlocked(gate) {
  if (!gate.blockedUntil) return false;
  if (Date.now() >= gate.blockedUntil) {
    gate.blockedUntil = null;
    return false;
  }
  return true;
}
function clearCleanupTimer(gate) {
  if (!gate.cleanupTimer) return;
  clearTimeout(gate.cleanupTimer);
  gate.cleanupTimer = null;
}
function cleanupGateIfIdle(semaphoreKey) {
  const gate = gates.get(semaphoreKey);
  if (!gate) return;
  if (gate.running > 0 || gate.queue.length > 0 || isBlocked(gate)) return;
  clearCleanupTimer(gate);
  gates.delete(semaphoreKey);
}
function scheduleCleanup(semaphoreKey) {
  const gate = gates.get(semaphoreKey);
  if (!gate) return;
  clearCleanupTimer(gate);
  gate.cleanupTimer = setTimeout(() => {
    gate.cleanupTimer = null;
    cleanupGateIfIdle(semaphoreKey);
  }, 0);
  gate.cleanupTimer.unref?.();
}
function drainQueue(semaphoreKey) {
  const gate = gates.get(semaphoreKey);
  if (!gate) return;
  while (gate.queue.length > 0 && gate.running < gate.maxConcurrency && !isBlocked(gate)) {
    const next = gate.queue.shift();
    if (!next) break;
    clearTimeout(next.timer);
    gate.running++;
    next.resolve(createReleaseFn(semaphoreKey));
  }
  if (gate.running === 0 && gate.queue.length === 0) {
    scheduleCleanup(semaphoreKey);
  }
}
function createReleaseFn(semaphoreKey) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const gate = gates.get(semaphoreKey);
    if (!gate) return;
    if (gate.running > 0) {
      gate.running--;
    }
    if (gate.queue.length > 0) {
      drainQueue(semaphoreKey);
      return;
    }
    scheduleCleanup(semaphoreKey);
  };
}
function createSemaphoreTimeoutError(semaphoreKey, timeoutMs) {
  const error = new Error(`Semaphore timeout after ${timeoutMs}ms for ${semaphoreKey}`);
  error.code = "SEMAPHORE_TIMEOUT";
  return error;
}
function makeAbortError(signal) {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const err = new Error(typeof reason === "string" ? reason : "The operation was aborted");
  err.name = "AbortError";
  return err;
}
function acquire(semaphoreKey, {
  maxConcurrency = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal = null,
  maxQueueSize = DEFAULT_MAX_QUEUE_SIZE
} = {}) {
  if (isBypassed(maxConcurrency)) {
    return Promise.resolve(createNoopReleaseFn());
  }
  if (signal?.aborted) {
    return Promise.reject(makeAbortError(signal));
  }
  const gate = ensureGate(semaphoreKey, maxConcurrency);
  clearCleanupTimer(gate);
  if (gate.running < gate.maxConcurrency && !isBlocked(gate)) {
    gate.running++;
    return Promise.resolve(createReleaseFn(semaphoreKey));
  }
  if (gate.queue.length >= maxQueueSize) {
    const err = new Error(`Semaphore queue full (${maxQueueSize}) for ${semaphoreKey}`);
    err.code = "SEMAPHORE_QUEUE_FULL";
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    let abortListener = null;
    const cleanup = () => {
      if (abortListener && signal) {
        signal.removeEventListener("abort", abortListener);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      const nextGate = gates.get(semaphoreKey);
      if (!nextGate) {
        reject(createSemaphoreTimeoutError(semaphoreKey, timeoutMs));
        return;
      }
      const queueIndex = nextGate.queue.findIndex((item) => item.timer === timer);
      if (queueIndex !== -1) {
        nextGate.queue.splice(queueIndex, 1);
      }
      if (nextGate.running === 0 && nextGate.queue.length === 0) {
        scheduleCleanup(semaphoreKey);
      }
      reject(createSemaphoreTimeoutError(semaphoreKey, timeoutMs));
    }, timeoutMs);
    timer.unref?.();
    const queueItem = {
      resolve: (release) => {
        cleanup();
        resolve(release);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
      timer
    };
    gate.queue.push(queueItem);
    if (signal) {
      abortListener = () => {
        cleanup();
        clearTimeout(timer);
        const nextGate = gates.get(semaphoreKey);
        if (!nextGate) {
          reject(makeAbortError(signal));
          return;
        }
        const queueIndex = nextGate.queue.findIndex((item) => item.timer === timer);
        if (queueIndex !== -1) {
          nextGate.queue.splice(queueIndex, 1);
        }
        if (nextGate.running === 0 && nextGate.queue.length === 0) {
          scheduleCleanup(semaphoreKey);
        }
        reject(makeAbortError(signal));
      };
      if (signal.aborted) {
        abortListener();
      } else {
        signal.addEventListener("abort", abortListener);
      }
    }
  });
}
function markBlocked(semaphoreKey, cooldownMs) {
  const safeCooldownMs = Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : 0;
  if (safeCooldownMs <= 0) {
    const gate2 = gates.get(semaphoreKey);
    if (!gate2) return;
    gate2.blockedUntil = null;
    drainQueue(semaphoreKey);
    return;
  }
  const gate = gates.get(semaphoreKey) ?? ensureGate(semaphoreKey, 1);
  clearCleanupTimer(gate);
  gate.blockedUntil = Date.now() + safeCooldownMs;
  const timer = setTimeout(() => {
    const nextGate = gates.get(semaphoreKey);
    if (!nextGate) return;
    if (nextGate.blockedUntil && Date.now() >= nextGate.blockedUntil) {
      nextGate.blockedUntil = null;
      drainQueue(semaphoreKey);
      if (nextGate.running === 0 && nextGate.queue.length === 0) {
        scheduleCleanup(semaphoreKey);
      }
    }
  }, safeCooldownMs + 50);
  timer.unref?.();
}
function getStats() {
  const stats = {};
  for (const [key, gate] of gates) {
    stats[key] = {
      running: gate.running,
      queued: gate.queue.length,
      maxConcurrency: gate.maxConcurrency,
      blockedUntil: gate.blockedUntil ? new Date(gate.blockedUntil).toISOString() : null
    };
  }
  return stats;
}
function isAccountSemaphoreFull(provider, accountKey, maxConcurrency) {
  if (isBypassed(maxConcurrency)) return false;
  const key = buildAccountSemaphoreKey({ provider, accountKey });
  const gate = gates.get(key);
  if (!gate) return false;
  const effectiveCap = maxConcurrency ?? gate.maxConcurrency;
  if (isBypassed(effectiveCap)) return false;
  return gate.running >= effectiveCap || isBlocked(gate);
}
function reset(semaphoreKey) {
  const gate = gates.get(semaphoreKey);
  if (!gate) return;
  clearCleanupTimer(gate);
  for (const entry of gate.queue) {
    clearTimeout(entry.timer);
    entry.reject(new Error("Semaphore reset"));
  }
  gates.delete(semaphoreKey);
}
function resetAll() {
  for (const key of gates.keys()) {
    reset(key);
  }
}
export {
  acquire,
  buildAccountSemaphoreKey,
  getStats,
  isAccountSemaphoreFull,
  markBlocked,
  reset,
  resetAll
};
