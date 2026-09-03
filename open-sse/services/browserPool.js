import { Buffer } from "node:buffer";
import { log } from "../utils/log.js";
function createBrowserPoolMetrics() {
  return {
    browserLaunches: 0,
    browserLaunchFailures: 0,
    contextsCreated: 0,
    contextsReused: 0,
    contextsEvicted: 0,
    contextsReleased: 0,
    contextCreateFailures: 0,
    shutdowns: 0,
    lastShutdownReason: null
  };
}
const POOL_IDLE_TIMEOUT_MS = 5 * 60 * 1e3;
const CONTEXT_TTL_MS = 10 * 60 * 1e3;
const EVICT_INTERVAL_MS = 60 * 1e3;
const DEFAULT_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const state = {
  browser: null,
  contexts: /* @__PURE__ */ new Map(),
  pendingContexts: /* @__PURE__ */ new Map(),
  launching: null,
  lastActivity: 0,
  idleTimer: null,
  evictTimer: null,
  cloakLaunch: null,
  cloakLaunchResolved: false,
  metrics: createBrowserPoolMetrics()
};
function getCloakbrowserModuleId() {
  return ["cloak", "browser"].join("");
}
async function resolveCloakLaunch() {
  if (state.cloakLaunchResolved) return state.cloakLaunch;
  state.cloakLaunchResolved = true;
  try {
    const mod = await import(getCloakbrowserModuleId());
    state.cloakLaunch = mod.launch ?? null;
  } catch {
    state.cloakLaunch = null;
  }
  return state.cloakLaunch;
}
function isPoolEnabled() {
  const flag = process.env.OMNIROUTE_BROWSER_POOL;
  if (flag === void 0) return true;
  return flag !== "off" && flag !== "0" && flag !== "false";
}
function resetIdleTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    void shutdownPool("idle-timeout");
  }, POOL_IDLE_TIMEOUT_MS);
  state.idleTimer.unref?.();
}
function evictStaleContexts() {
  const now = Date.now();
  for (const [key, pooled] of state.contexts) {
    if (now - pooled.lastUsed > CONTEXT_TTL_MS) {
      log.info(
        "BROWSER-POOL",
        "[BrowserPool] Evicted stale context",
        "(idle",
        ((now - pooled.lastUsed) / 1e3).toFixed(0) + "s)"
      );
      state.contexts.delete(key);
      state.metrics.contextsEvicted++;
      pooled.context.close().catch(() => {
      });
    }
  }
  if (state.contexts.size === 0 && !state.launching) {
    void shutdownPool("all-contexts-evicted");
  }
}
function startEvictTimer() {
  if (state.evictTimer) clearInterval(state.evictTimer);
  state.evictTimer = setInterval(() => evictStaleContexts(), EVICT_INTERVAL_MS);
  state.evictTimer.unref?.();
}
async function resolvePlaywrightProxy(providerKey, deps) {
  try {
    const resolver = deps?.resolveProxy ?? (async (id) => {
      const { resolveProxyForProvider } = await import("../../src/lib/db/proxies");
      return resolveProxyForProvider(id);
    });
    const p = await resolver(providerKey);
    if (!p?.host) return void 0;
    const scheme = p.type === "socks5" ? "socks5" : "http";
    const proxy = {
      server: `${scheme}://${p.host}:${p.port}`
    };
    if (p.username) {
      proxy.username = String(p.username);
      proxy.password = p.password == null ? "" : String(p.password);
    }
    return proxy;
  } catch (err) {
    log.warn("BROWSER-POOL", "[BrowserPool] Failed to resolve proxy from DB:", err);
    return void 0;
  }
}
async function resolveBrowserContextProxy(contextKey, options, deps) {
  return resolvePlaywrightProxy(options.proxyProviderKey ?? contextKey, deps);
}
async function launchBrowser() {
  if (state.browser) return state.browser;
  if (state.launching) return state.launching;
  state.launching = (async () => {
    const cloakLaunch = await resolveCloakLaunch();
    let browser;
    if (cloakLaunch) {
      browser = await cloakLaunch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"]
      });
    } else {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled"
        ]
      });
    }
    state.browser = browser;
    state.launching = null;
    state.metrics.browserLaunches++;
    return browser;
  })();
  try {
    return await state.launching;
  } catch (err) {
    state.launching = null;
    state.metrics.browserLaunchFailures++;
    throw err;
  }
}
function parseCookieString(raw, domain) {
  return raw.split(";").map((p) => p.trim()).filter(Boolean).map((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0) return null;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name || !value) return null;
    return {
      name,
      value,
      domain: domain.startsWith(".") ? domain : `.${domain}`,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: true,
      sameSite: "Lax"
    };
  }).filter(Boolean);
}
function settlePendingContext(key, failed) {
  if (failed) state.metrics.contextCreateFailures++;
  state.pendingContexts.delete(key);
}
async function seedContextSession(context, options) {
  if (options.cookieString) {
    const cookies = parseCookieString(options.cookieString, options.cookieDomain);
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }
  }
  if (!options.localStorage || Object.keys(options.localStorage).length === 0) return;
  const origin = new URL(options.localStorageOrigin || options.warmupUrl || "").origin;
  await context.addInitScript(
    ({ expectedOrigin, entries }) => {
      if (window.location.origin !== expectedOrigin) return;
      for (const [name, value] of entries) {
        window.localStorage.setItem(name, value);
      }
    },
    {
      expectedOrigin: origin,
      entries: Object.entries(options.localStorage)
    }
  );
}
async function acquireBrowserContext(key, options) {
  if (!isPoolEnabled()) {
    throw new Error(
      "browserPool: OMNIROUTE_BROWSER_POOL=off \u2014 context requested but pool is disabled"
    );
  }
  const existing = state.contexts.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    state.lastActivity = Date.now();
    state.metrics.contextsReused++;
    resetIdleTimer();
    return existing;
  }
  const pending = state.pendingContexts.get(key);
  if (pending) return pending;
  const createPromise = (async () => {
    const [browser, proxy] = await Promise.all([
      launchBrowser(),
      resolveBrowserContextProxy(key, options)
    ]);
    const isStealth = state.cloakLaunch !== null;
    const context = await browser.newContext({
      userAgent: options.userAgent || DEFAULT_USER_AGENT,
      locale: options.locale || "en-US",
      timezoneId: options.timezone || "America/New_York",
      viewport: { width: 1280, height: 800 },
      ...proxy ? { proxy } : {}
    });
    await seedContextSession(context, options);
    let warmupPage = null;
    if (options.warmupUrl) {
      try {
        warmupPage = await context.newPage();
        await warmupPage.goto(options.warmupUrl, {
          waitUntil: "domcontentloaded",
          timeout: 3e4
        });
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        try {
          await warmupPage?.close();
        } catch {
        }
        warmupPage = null;
        void err;
      }
    }
    if (state.browser !== browser) {
      await context.close().catch(() => {
      });
      if (warmupPage) {
        await warmupPage.close().catch(() => {
        });
      }
      throw new Error("Pool shut down during context creation");
    }
    const pooled = {
      id: key,
      context,
      warmupPage,
      lastUsed: Date.now(),
      isStealth
    };
    state.contexts.set(key, pooled);
    state.metrics.contextsCreated++;
    state.lastActivity = Date.now();
    resetIdleTimer();
    startEvictTimer();
    return pooled;
  })();
  state.pendingContexts.set(key, createPromise);
  createPromise.then(() => settlePendingContext(key, false)).catch(() => settlePendingContext(key, true));
  return createPromise;
}
async function openPage(pooled) {
  return pooled.context.newPage();
}
async function releaseBrowserContext(key) {
  const pooled = state.contexts.get(key);
  if (!pooled) return;
  state.contexts.delete(key);
  state.metrics.contextsReleased++;
  try {
    await pooled.context.close();
  } catch {
  }
  if (state.contexts.size === 0) {
    await shutdownPool("last-context-closed");
  }
}
async function shutdownPool(reason) {
  state.metrics.shutdowns++;
  state.metrics.lastShutdownReason = reason;
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
  if (state.evictTimer) {
    clearInterval(state.evictTimer);
    state.evictTimer = null;
  }
  state.pendingContexts.clear();
  for (const [key, pooled] of state.contexts) {
    try {
      await pooled.context.close();
    } catch {
    }
    state.contexts.delete(key);
  }
  if (state.browser) {
    try {
      await state.browser.close();
    } catch {
    }
    state.browser = null;
  }
  state.lastActivity = Date.now();
  void reason;
}
function getBrowserPoolStatus() {
  return {
    enabled: isPoolEnabled(),
    contexts: state.contexts.size,
    browserRunning: state.browser !== null,
    stealthAvailable: state.cloakLaunch !== null,
    lastActivityAgoMs: state.lastActivity === 0 ? -1 : Date.now() - state.lastActivity
  };
}
function getBrowserPoolMetrics() {
  return { status: getBrowserPoolStatus(), metrics: { ...state.metrics } };
}
function __resetBrowserPoolMetricsForTest() {
  state.metrics = createBrowserPoolMetrics();
}
async function readPageResponseBody(response) {
  const headers = {};
  for (const [name, value] of Object.entries(response.headers())) {
    headers[name] = value;
  }
  const body = await response.body();
  return { status: response.status(), headers, body: Buffer.from(body) };
}
export {
  __resetBrowserPoolMetricsForTest,
  acquireBrowserContext,
  getBrowserPoolMetrics,
  getBrowserPoolStatus,
  openPage,
  readPageResponseBody,
  releaseBrowserContext,
  resolveBrowserContextProxy,
  resolvePlaywrightProxy,
  shutdownPool
};
