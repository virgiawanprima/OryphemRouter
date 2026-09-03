const DISPATCHER_CACHE_KEY = Symbol.for("omniroute.proxyDispatcher.cache");
const DEFAULT_DISPATCHER_KEY = Symbol.for("omniroute.proxyDispatcher.default");
const RETRY_DISPATCHER_KEY = Symbol.for("omniroute.proxyDispatcher.retry");
const MAX_DISPATCHER_CACHE_ENTRIES = 512;
class RoundRobinDispatcher {
  dispatchers;
  nextIndex = 0;
  constructor(dispatchers) {
    this.dispatchers = dispatchers;
  }
  dispatch(options, handler) {
    const dispatcher = this.dispatchers[this.nextIndex % this.dispatchers.length];
    this.nextIndex = (this.nextIndex + 1) % this.dispatchers.length;
    return dispatcher.dispatch(options, handler);
  }
  close(callback) {
    const done = Promise.all(this.dispatchers.map((dispatcher) => dispatcher.close())).then(
      () => void 0
    );
    if (callback) {
      done.then(callback);
      return;
    }
    return done;
  }
  destroy(errorOrCallback, callback) {
    const callbackFn = typeof errorOrCallback === "function" ? errorOrCallback : callback;
    const error = typeof errorOrCallback === "function" ? null : errorOrCallback ?? null;
    const done = Promise.all(this.dispatchers.map((dispatcher) => dispatcher.destroy(error))).then(
      () => void 0
    );
    if (callbackFn) {
      done.then(callbackFn);
      return;
    }
    return done;
  }
}
function createRoundRobinDispatcher(dispatchers) {
  return new RoundRobinDispatcher(dispatchers);
}
function getDispatcherCache() {
  const globalWithCache = globalThis;
  if (!globalWithCache[DISPATCHER_CACHE_KEY]) {
    globalWithCache[DISPATCHER_CACHE_KEY] = /* @__PURE__ */ new Map();
  }
  return globalWithCache[DISPATCHER_CACHE_KEY];
}
function getDefaultCachedDispatcher() {
  return globalThis[DEFAULT_DISPATCHER_KEY];
}
function setDefaultCachedDispatcher(dispatcher) {
  globalThis[DEFAULT_DISPATCHER_KEY] = dispatcher;
}
function getRetryCachedDispatcher() {
  return globalThis[RETRY_DISPATCHER_KEY];
}
function setRetryCachedDispatcher(dispatcher) {
  globalThis[RETRY_DISPATCHER_KEY] = dispatcher;
}
function closeDispatcher(dispatcher) {
  if (!dispatcher) return;
  try {
    const result = dispatcher.close();
    if (result && typeof result.catch === "function") {
      void result.catch(() => {
      });
    }
  } catch {
  }
}
function clearDispatcherCache() {
  const cache = getDispatcherCache();
  for (const dispatcher of cache.values()) {
    closeDispatcher(dispatcher);
  }
  cache.clear();
  const globalWithCache = globalThis;
  closeDispatcher(globalWithCache[DEFAULT_DISPATCHER_KEY]);
  closeDispatcher(globalWithCache[RETRY_DISPATCHER_KEY]);
  delete globalWithCache[DEFAULT_DISPATCHER_KEY];
  delete globalWithCache[RETRY_DISPATCHER_KEY];
}
function __cacheProxyDispatcherForTest(key, dispatcher) {
  getDispatcherCache().set(key, dispatcher);
}
function setDispatcherCacheEntry(key, dispatcher) {
  const cache = getDispatcherCache();
  if (cache.size >= MAX_DISPATCHER_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== void 0) {
      const evicted = cache.get(oldest);
      cache.delete(oldest);
      closeDispatcher(evicted);
    }
  }
  cache.set(key, dispatcher);
}
export {
  __cacheProxyDispatcherForTest,
  clearDispatcherCache,
  createRoundRobinDispatcher,
  getDefaultCachedDispatcher,
  getDispatcherCache,
  getRetryCachedDispatcher,
  setDefaultCachedDispatcher,
  setDispatcherCacheEntry,
  setRetryCachedDispatcher
};
