import { createRequire } from "module";
import { createHash } from "node:crypto";
import { getTlsClientTimeoutConfig } from "../services/tlsTimeouts.js";
import { log } from "./log.js";
const runtimeRequire = createRequire(import.meta.url);
function loadRuntimeModule(moduleName) {
  return Reflect.apply(runtimeRequire, void 0, [moduleName]);
}
let createSession;
try {
  const loaded = loadRuntimeModule("wreq-js");
  createSession = typeof loaded.createSession === "function" ? loaded.createSession : null;
} catch {
  if (process.env.ENABLE_TLS_FINGERPRINT === "true") {
    log.warn("TLS_CLIENT", "wreq-js unavailable; TLS fingerprint transport disabled");
  }
  createSession = null;
}
function getProxyFromEnv() {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy || void 0;
}
function normalizeHeaders(headers) {
  if (!headers) return void 0;
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  }
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }
  return normalized;
}
function sanitizeWreqError(error, message) {
  const sanitized = new Error(message);
  if (!error || typeof error !== "object") return sanitized;
  if ("code" in error && typeof error.code === "string" && /^[A-Z0-9_:-]{1,64}$/.test(error.code)) {
    sanitized.code = error.code;
  }
  if ("errorCode" in error && typeof error.errorCode === "string" && /^[a-zA-Z0-9_:-]{1,64}$/.test(error.errorCode)) {
    sanitized.errorCode = error.errorCode;
  }
  if ("statusCode" in error && typeof error.statusCode === "number" && Number.isFinite(error.statusCode)) {
    sanitized.statusCode = error.statusCode;
  }
  return sanitized;
}
function toNativeResponse(response, onFinalize, onBodyError, signal) {
  let finalized = false;
  let bodyFailureReported = false;
  let consumerCancelled = false;
  let consumerCancelReason;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    onFinalize();
  };
  const safeBodyError = (error) => {
    if (signal?.aborted) {
      return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
    }
    if (consumerCancelled) {
      return consumerCancelReason ?? new DOMException("The response body was cancelled", "AbortError");
    }
    if (!bodyFailureReported) {
      bodyFailureReported = true;
      onBodyError();
    }
    return sanitizeWreqError(error, "wreq-js response body failed");
  };
  if (response instanceof Response) {
    finalize();
    return response;
  }
  try {
    const headers = new Headers();
    for (const [name, value] of response.headers) headers.append(name, value);
    let body = null;
    if (response.body) {
      const reader = response.body.getReader();
      body = new ReadableStream({
        async pull(controller) {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              finalize();
              controller.close();
            } else {
              controller.enqueue(chunk.value);
            }
          } catch (error) {
            controller.error(safeBodyError(error));
            finalize();
          }
        },
        async cancel(reason) {
          consumerCancelled = true;
          consumerCancelReason = reason;
          try {
            await reader.cancel(reason);
          } catch (error) {
            throw safeBodyError(error);
          } finally {
            finalize();
          }
        }
      });
    } else {
      finalize();
    }
    const adapted = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
    if (response.url) {
      Object.defineProperty(adapted, "url", { value: response.url, configurable: true });
    }
    if (response.redirected !== void 0) {
      Object.defineProperty(adapted, "redirected", {
        value: response.redirected,
        configurable: true
      });
    }
    return adapted;
  } catch (error) {
    finalize();
    throw error;
  }
}
class TlsClient {
  createSessionFn;
  sessions = /* @__PURE__ */ new Map();
  pendingSessions = /* @__PURE__ */ new Map();
  pendingCloses = /* @__PURE__ */ new Set();
  sessionEpochs = /* @__PURE__ */ new Map();
  sessionUseCounts = /* @__PURE__ */ new Map();
  sessionLastUsed = /* @__PURE__ */ new Map();
  pendingEvictions = /* @__PURE__ */ new Set();
  accessSequence = 0;
  circuits = /* @__PURE__ */ new Map();
  globalSessionEpoch = 0;
  maxFailures = 3;
  baseCooldownMs = 3e4;
  maxCooldownMs = 6e5;
  legacySessionScope = "legacy";
  _libraryAvailable;
  maxSessions;
  constructor(createSessionFn = createSession, maxSessions = 128) {
    this.createSessionFn = createSessionFn;
    this._libraryAvailable = !!createSessionFn;
    this.maxSessions = Number.isInteger(maxSessions) && maxSessions > 0 ? maxSessions : 128;
  }
  /** Library availability only. Per-session circuit state is enforced inside fetch(). */
  get available() {
    return this._libraryAvailable;
  }
  resolveProxy(proxy) {
    return proxy === void 0 ? getProxyFromEnv() ?? null : proxy;
  }
  getSessionKey(resolvedProxy, sessionScope) {
    const scope = sessionScope?.trim() || this.legacySessionScope;
    return createHash("sha256").update(scope).update("\0").update(resolvedProxy ?? "").digest("base64url");
  }
  getDefaultSessionKey() {
    return this.getSessionKey(this.resolveProxy(void 0), this.legacySessionScope);
  }
  getSessionEpoch(key) {
    return this.sessionEpochs.get(key) ?? 0;
  }
  hasSessionCookies(session, url) {
    if (!session) return false;
    if (!session.getCookies) return true;
    try {
      return Object.keys(session.getCookies(url)).length > 0;
    } catch {
      return true;
    }
  }
  closeSession(session) {
    let closing;
    closing = Promise.resolve().then(() => session.close()).catch(() => {
    }).finally(() => {
      this.pendingCloses.delete(closing);
    });
    this.pendingCloses.add(closing);
    return closing;
  }
  findOldestIdleSession(protectedKey) {
    let candidate;
    let candidateSequence = Number.POSITIVE_INFINITY;
    for (const key of this.sessions.keys()) {
      if (key === protectedKey || (this.sessionUseCounts.get(key) ?? 0) > 0) continue;
      const sequence = this.sessionLastUsed.get(key) ?? 0;
      if (sequence < candidateSequence) {
        candidate = key;
        candidateSequence = sequence;
      }
    }
    return candidate;
  }
  reserveSessionCapacity(protectedKey) {
    if (this.pendingSessions.size >= this.maxSessions || this.pendingCloses.size >= this.maxSessions) {
      const error = new Error("wreq-js session capacity exhausted");
      error.code = "TLS_SESSION_CAPACITY";
      throw error;
    }
    while (this.sessions.size >= this.maxSessions) {
      const candidate = this.findOldestIdleSession(protectedKey);
      if (!candidate) {
        const error = new Error("wreq-js session capacity exhausted");
        error.code = "TLS_SESSION_CAPACITY";
        throw error;
      }
      void this.invalidateSession(candidate);
    }
  }
  retainSession(key) {
    this.pendingEvictions.delete(key);
    this.sessionUseCounts.set(key, (this.sessionUseCounts.get(key) ?? 0) + 1);
    this.sessionLastUsed.set(key, ++this.accessSequence);
  }
  releaseSession(key) {
    const remaining = (this.sessionUseCounts.get(key) ?? 1) - 1;
    if (remaining > 0) {
      this.sessionUseCounts.set(key, remaining);
      return;
    }
    this.sessionUseCounts.delete(key);
    if (this.pendingEvictions.delete(key)) {
      void this.invalidateSession(key);
      return;
    }
    this.evictSessionsIfNeeded();
  }
  evictSessionsIfNeeded(protectedKey) {
    while (this.sessions.size > this.maxSessions) {
      const candidate = this.findOldestIdleSession(protectedKey);
      if (candidate) {
        void this.invalidateSession(candidate);
        continue;
      }
      let activeCandidate;
      let candidateSequence = Number.POSITIVE_INFINITY;
      for (const key of this.sessions.keys()) {
        if (key === protectedKey || this.pendingEvictions.has(key)) continue;
        const sequence = this.sessionLastUsed.get(key) ?? 0;
        if (sequence < candidateSequence) {
          activeCandidate = key;
          candidateSequence = sequence;
        }
      }
      if (activeCandidate) this.pendingEvictions.add(activeCandidate);
      return;
    }
  }
  invalidateSession(key) {
    const pending = this.pendingSessions.get(key);
    const invalidatedEpoch = this.getSessionEpoch(key) + 1;
    this.sessionEpochs.set(key, invalidatedEpoch);
    this.pendingSessions.delete(key);
    this.sessionUseCounts.delete(key);
    this.sessionLastUsed.delete(key);
    this.pendingEvictions.delete(key);
    const session = this.sessions.get(key);
    this.sessions.delete(key);
    if (pending) {
      void pending.finally(() => {
        if (this.getSessionEpoch(key) === invalidatedEpoch && !this.pendingSessions.has(key) && !this.sessions.has(key)) {
          this.sessionEpochs.delete(key);
        }
      }).catch(() => {
      });
    } else {
      this.sessionEpochs.delete(key);
    }
    return session ? this.closeSession(session) : Promise.resolve();
  }
  async closeSessions() {
    const pending = [...this.pendingSessions.values()];
    this.globalSessionEpoch++;
    this.pendingSessions.clear();
    this.sessionEpochs.clear();
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    this.sessionUseCounts.clear();
    this.sessionLastUsed.clear();
    this.pendingEvictions.clear();
    this.circuits.clear();
    const closes = sessions.map((session) => this.closeSession(session));
    await Promise.allSettled([...closes, ...pending]);
    await Promise.allSettled([...this.pendingCloses]);
  }
  checkCircuit(key = this.getDefaultSessionKey()) {
    const state = this.circuits.get(key);
    if (!state || !state.circuitTripped) return true;
    if (Date.now() < state.circuitOpenUntil) return false;
    if (state.halfOpenInFlight) return false;
    state.halfOpenInFlight = true;
    log.info("TLS_CLIENT", "Half-open: retrying after cooldown");
    return true;
  }
  recordFailure(key = this.getDefaultSessionKey(), sessionHadCookies = false) {
    const state = this.circuits.get(key) ?? {
      failureCount: 0,
      cooldownMs: this.baseCooldownMs,
      cooldownMultiplier: 1,
      circuitOpenUntil: 0,
      circuitTripped: false,
      halfOpenInFlight: false,
      sessionHadCookies: false
    };
    state.sessionHadCookies ||= sessionHadCookies;
    state.failureCount++;
    state.halfOpenInFlight = false;
    if (state.failureCount >= this.maxFailures) {
      state.circuitOpenUntil = Date.now() + state.cooldownMs;
      state.circuitTripped = true;
      if ((this.sessionUseCounts.get(key) ?? 0) > 0) {
        this.pendingEvictions.add(key);
      } else {
        void this.invalidateSession(key);
      }
      log.warn(
        "TLS_CLIENT",
        `Circuit opened after ${state.failureCount} consecutive failures, cooling down for ${state.cooldownMs}ms`
      );
      state.cooldownMultiplier = Math.min(state.cooldownMultiplier * 2, 20);
      state.cooldownMs = Math.min(
        this.baseCooldownMs * state.cooldownMultiplier,
        this.maxCooldownMs
      );
    }
    this.circuits.delete(key);
    this.circuits.set(key, state);
    const maxCircuitEntries = this.maxSessions * 2;
    while (this.circuits.size > maxCircuitEntries) {
      const oldestKey = this.circuits.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.circuits.delete(oldestKey);
    }
  }
  recordSuccess(key = this.getDefaultSessionKey()) {
    const state = this.circuits.get(key);
    if (state?.circuitTripped) {
      log.info("TLS_CLIENT", "Circuit closed (success after cooldown)");
    }
    this.circuits.delete(key);
  }
  releaseHalfOpen(key) {
    const state = this.circuits.get(key);
    if (state) state.halfOpenInFlight = false;
  }
  async getSession(resolvedProxy, key) {
    const cached = this.sessions.get(key);
    if (cached) {
      this.pendingEvictions.delete(key);
      this.sessionLastUsed.set(key, ++this.accessSequence);
      return cached;
    }
    const pending = this.pendingSessions.get(key);
    if (pending) return pending;
    if (!this.createSessionFn) return null;
    this.reserveSessionCapacity(key);
    const sessionOpts = {
      browser: "chrome_124",
      os: "macos"
    };
    if (resolvedProxy) sessionOpts.proxy = resolvedProxy;
    const globalEpoch = this.globalSessionEpoch;
    const sessionEpoch = this.getSessionEpoch(key);
    const creating = Reflect.apply(this.createSessionFn, void 0, [sessionOpts]).then(async (session) => {
      if (globalEpoch !== this.globalSessionEpoch || sessionEpoch !== this.getSessionEpoch(key)) {
        await this.closeSession(session);
        throw new Error("wreq-js session invalidated");
      }
      if (this.sessions.size >= this.maxSessions) {
        const candidate = this.findOldestIdleSession(key);
        if (!candidate) {
          await this.closeSession(session);
          const error = new Error("wreq-js session capacity exhausted");
          error.code = "TLS_SESSION_CAPACITY";
          throw error;
        }
        void this.invalidateSession(candidate);
      }
      this.sessions.set(key, session);
      this.sessionLastUsed.set(key, ++this.accessSequence);
      this.evictSessionsIfNeeded(key);
      log.info("TLS_CLIENT", "Session created (Chrome 124 TLS fingerprint)");
      return session;
    }).finally(() => {
      if (this.pendingSessions.get(key) === creating) {
        this.pendingSessions.delete(key);
        this.sessionEpochs.delete(key);
      }
    });
    this.pendingSessions.set(key, creating);
    return creating;
  }
  /** Fetch with Chrome 124 TLS fingerprint and an account-scoped persistent cookie jar. */
  async fetch(url, options = {}) {
    const resolvedProxy = this.resolveProxy(options.proxy);
    const key = this.getSessionKey(resolvedProxy, options.sessionScope);
    if (!this.checkCircuit(key)) {
      const state = this.circuits.get(key);
      const error = new Error("wreq-js circuit open \u2014 skipping TLS request");
      error.code = "TLS_CIRCUIT_OPEN";
      if (state?.sessionHadCookies) {
        Object.defineProperty(error, "sessionHadCookies", {
          value: true,
          configurable: true
        });
      }
      throw error;
    }
    let session = null;
    let sessionUseRetained = false;
    const releaseSession = () => {
      if (!sessionUseRetained) return;
      sessionUseRetained = false;
      this.releaseSession(key);
    };
    try {
      session = await this.getSession(resolvedProxy, key);
      if (!session) throw new Error("wreq-js not available");
      this.retainSession(key);
      sessionUseRetained = true;
      const { timeoutMs } = getTlsClientTimeoutConfig(process.env, (message) => {
        log.warn("TLS_CLIENT", message);
      });
      const wreqOptions = {
        method: (options.method || "GET").toUpperCase(),
        headers: normalizeHeaders(options.headers),
        body: options.body,
        redirect: options.redirect ?? "follow",
        timeout: timeoutMs
      };
      if (options.signal) wreqOptions.signal = options.signal;
      const response = toNativeResponse(
        await session.fetch(url, wreqOptions),
        releaseSession,
        () => this.recordFailure(key, this.hasSessionCookies(session, url)),
        options.signal
      );
      this.recordSuccess(key);
      return response;
    } catch (err) {
      const isCallerAbort = options.signal?.aborted === true;
      const sessionHadCookies = !isCallerAbort && this.hasSessionCookies(session, url);
      releaseSession();
      if (isCallerAbort) {
        this.releaseHalfOpen(key);
      } else {
        this.recordFailure(key, sessionHadCookies);
      }
      if (isCallerAbort) throw err;
      const transportError = sanitizeWreqError(err, "wreq-js transport failed");
      if (sessionHadCookies) {
        Object.defineProperty(transportError, "sessionHadCookies", {
          value: true,
          configurable: true
        });
      }
      throw transportError;
    }
  }
  async exit() {
    await this.closeSessions();
  }
  resetCircuit(proxy, sessionScope) {
    if (arguments.length === 0) {
      this.circuits.clear();
      return;
    }
    const resolvedProxy = this.resolveProxy(proxy);
    this.circuits.delete(this.getSessionKey(resolvedProxy, sessionScope));
  }
  getCircuitState(proxy, sessionScope) {
    const resolvedProxy = this.resolveProxy(proxy);
    const key = this.getSessionKey(resolvedProxy, sessionScope);
    const state = this.circuits.get(key);
    const circuitOpenUntil = state?.circuitOpenUntil ?? 0;
    const circuitTripped = state?.circuitTripped ?? false;
    return {
      available: this._libraryAvailable && (!circuitTripped || Date.now() >= circuitOpenUntil),
      circuitTripped,
      failureCount: state?.failureCount ?? 0,
      circuitOpenUntil,
      coolDownRemainingMs: circuitOpenUntil > 0 ? Math.max(0, circuitOpenUntil - Date.now()) : 0
    };
  }
}
const TLS_CLIENT_KEY = Symbol.for("omniroute.tlsClient.instance");
const scopedGlobal = globalThis;
const tlsClient = scopedGlobal[TLS_CLIENT_KEY] ?? new TlsClient();
scopedGlobal[TLS_CLIENT_KEY] = tlsClient;
var tlsClient_default = tlsClient;
export {
  TlsClient,
  tlsClient_default as default
};
