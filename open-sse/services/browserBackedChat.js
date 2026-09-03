import { Buffer } from "node:buffer";
import {
  acquireBrowserContext,
  openPage,
  readPageResponseBody,
  shutdownPool
} from "./browserPool.js";
import tlsClient from "../utils/tlsClient.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { resolveHttpBackedChatFingerprint } from "./httpBackedChatFingerprint.js";
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const COOKIE_CACHE_TTL_MS = 5 * 60 * 1e3;
const COOKIE_POLL_INTERVAL_MS = 500;
const COOKIE_POLL_TIMEOUT_MS = 5e3;
const CIRCUIT_BASE_COOLDOWN_MS = 3e4;
const CIRCUIT_MAX_COOLDOWN_MS = 6e5;
const cookieCache = /* @__PURE__ */ new Map();
function getCachedCookies(domain) {
  const cached = cookieCache.get(domain);
  if (cached && Date.now() < cached.expiresAt) return cached.cookieString;
  cookieCache.delete(domain);
  return null;
}
function setCachedCookies(domain, cookieString, ttlMs) {
  cookieCache.set(domain, {
    cookieString,
    expiresAt: Date.now() + (ttlMs ?? COOKIE_CACHE_TTL_MS),
    domain
  });
}
const pendingRefreshes = /* @__PURE__ */ new Map();
let testOverride = null;
let httpOverride = null;
function __setBrowserBackedChatOverrideForTesting(fn) {
  testOverride = fn;
}
function __resetBrowserBackedChatOverrideForTesting() {
  testOverride = null;
  cookieCache.clear();
}
function __setHttpBackedChatOverrideForTesting(fn) {
  httpOverride = fn;
}
function __resetHttpBackedChatOverrideForTesting() {
  httpOverride = null;
  cookieCache.clear();
}
async function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  let abortListener;
  const aborted = new Promise((_, reject) => {
    abortListener = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}
function waitWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
async function uploadBrowserAttachments(page, attachments, chatUrlMatchDomain, signal) {
  if (attachments.length === 0) return;
  const fileInput = page.locator('input[type="file"]').first();
  await withAbort(fileInput.waitFor({ state: "attached", timeout: 1e4 }), signal);
  for (const attachment of attachments) {
    const uploadResponsePromise = page.waitForResponse(
      (response) => {
        if (response.request().method() !== "POST") return false;
        try {
          const url = new URL(response.url());
          return url.hostname.endsWith(chatUrlMatchDomain) && /\/api\/v1\/files\/?$/.test(url.pathname);
        } catch {
          return false;
        }
      },
      { timeout: 3e4 }
    );
    const [uploadResponse] = await Promise.all([
      uploadResponsePromise,
      fileInput.setInputFiles({
        name: attachment.name,
        mimeType: attachment.mimeType,
        buffer: attachment.buffer
      })
    ]);
    if (!uploadResponse.ok()) {
      throw new Error(`attachment upload returned HTTP ${uploadResponse.status()}`);
    }
    await waitWithSignal(150, signal);
  }
}
async function settlePoolKey(requestedKey, reuseContext) {
  if (reuseContext) return { key: requestedKey, acquired: true };
  return {
    key: `${requestedKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    acquired: false
  };
}
function chatUrlMatcher(u, matchDomain, chatUrl) {
  if (u === chatUrl) return true;
  let parsed;
  let chatParsed;
  try {
    parsed = new URL(u);
    chatParsed = new URL(chatUrl);
  } catch {
    return false;
  }
  if (!parsed.host.endsWith(matchDomain)) return false;
  const chatSeg = chatParsed.pathname.split("/").filter(Boolean);
  const reqSeg = parsed.pathname.split("/").filter(Boolean);
  if (chatSeg.length < 2 || reqSeg.length !== chatSeg.length) return false;
  let allowedDynamic = 1;
  for (let i = 0; i < chatSeg.length; i++) {
    if (chatSeg[i] === reqSeg[i]) continue;
    if (chatSeg[i] === "PLACEHOLDER" && allowedDynamic > 0) {
      allowedDynamic--;
      continue;
    }
    return false;
  }
  return true;
}
async function browserBackedChat(req) {
  if (testOverride) return testOverride(req);
  const t0 = Date.now();
  const {
    poolKey,
    chatUrl,
    chatPageUrl,
    userMessage,
    cookieString,
    localStorage,
    localStorageOrigin,
    cookieDomain,
    chatUrlMatchDomain,
    userAgent,
    locale,
    timezone,
    inputSelector,
    submitButtonSelector,
    submitButtonMode = "playwright",
    attachments = [],
    beforeSubmit,
    postSubmitWaitMs = 15e3,
    signal,
    reuseContext = true
  } = req;
  const { key, acquired: reuseAcquired } = await settlePoolKey(poolKey, reuseContext);
  const tAcquireStart = Date.now();
  const pooled = await acquireBrowserContext(key, {
    cookieDomain: cookieDomain || chatUrlMatchDomain,
    cookieString: cookieString || null,
    localStorage,
    localStorageOrigin,
    warmupUrl: chatPageUrl,
    userAgent,
    locale,
    timezone
  });
  const acquireContextMs = Date.now() - tAcquireStart;
  const page = await openPage(pooled);
  const observedPostUrls = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    try {
      const url = new URL(request.url());
      if (!url.hostname.endsWith(chatUrlMatchDomain)) return;
      const sanitized = `${url.origin}${url.pathname}`;
      if (!observedPostUrls.includes(sanitized)) observedPostUrls.push(sanitized);
    } catch {
    }
  });
  try {
    const tNavStart = Date.now();
    await withAbort(
      page.goto(chatPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 6e4
      }),
      signal
    );
    await waitWithSignal(2500, signal);
    const navigateMs = Date.now() - tNavStart;
    if (beforeSubmit) {
      await beforeSubmit(page);
    }
    await uploadBrowserAttachments(page, attachments, chatUrlMatchDomain, signal);
    const inputLocator = page.locator(inputSelector).first();
    await withAbort(inputLocator.waitFor({ state: "visible", timeout: 1e4 }), signal);
    await inputLocator.fill(userMessage);
    await waitWithSignal(800, signal);
    const tSubmitStart = Date.now();
    const responsePromise = page.waitForResponse(
      (r) => r.request().method() === "POST" && chatUrlMatcher(r.url(), chatUrlMatchDomain, chatUrl),
      { timeout: 3e4 }
    );
    let abortListener;
    const signalPromise = signal ? new Promise((_, reject) => {
      if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
      abortListener = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abortListener, { once: true });
    }) : null;
    if (submitButtonSelector) {
      const btn = page.locator(submitButtonSelector).first();
      if (await btn.count() > 0) {
        try {
          if (submitButtonMode === "dom") {
            await btn.evaluate((element) => element.click());
          } else {
            await btn.click({ timeout: 2e3 });
          }
        } catch {
          await page.keyboard.press("Enter");
        }
      } else {
        await page.keyboard.press("Enter");
      }
    } else {
      await page.keyboard.press("Enter");
    }
    const tCaptureStart = Date.now();
    const response = signalPromise ? await Promise.race([responsePromise, signalPromise]).catch(() => null) : await responsePromise.catch(() => null);
    if (signal && abortListener) {
      signal.removeEventListener("abort", abortListener);
    }
    if (response) {
      await Promise.race([
        response.finished().then(() => void 0),
        waitWithSignal(Math.min(postSubmitWaitMs, 3e4), signal)
      ]);
    }
    const captureResponseMs = Date.now() - tCaptureStart;
    const submitMs = captureResponseMs;
    let status = 0;
    let contentType = null;
    let body = Buffer.alloc(0);
    if (response) {
      const captured = await readPageResponseBody(response);
      if (captured.body.length > MAX_RESPONSE_BYTES) {
        body = Buffer.from(
          JSON.stringify({
            error: {
              message: "Response too large",
              type: "upstream_error"
            }
          })
        );
        status = 502;
        contentType = "application/json";
      } else {
        status = captured.status;
        contentType = captured.headers["content-type"] || null;
        body = captured.body;
      }
    }
    return {
      status,
      contentType,
      body,
      isStealth: pooled.isStealth,
      observedPostUrls,
      timing: {
        acquireContextMs,
        navigateMs,
        submitMs,
        captureResponseMs,
        totalMs: Date.now() - t0
      }
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const body = Buffer.from(
      JSON.stringify({
        error: {
          message: sanitizeErrorMessage(`browserBackedChat failed: ${msg}`),
          type: "upstream_error"
        }
      })
    );
    return {
      status: 502,
      contentType: "application/json",
      body,
      isStealth: pooled.isStealth,
      observedPostUrls,
      timing: {
        acquireContextMs,
        navigateMs: 0,
        submitMs: 0,
        captureResponseMs: 0,
        totalMs: Date.now() - t0
      }
    };
  } finally {
    await page.close();
    if (!reuseAcquired) {
      try {
        await pooled.context.close();
      } catch {
      }
    }
  }
}
async function httpBackedChat(req) {
  if (httpOverride) return httpOverride(req);
  const t0 = Date.now();
  const { chatUrl, userMessage, cookieString, cookieDomain, chatUrlMatchDomain, signal } = req;
  const fingerprint = resolveHttpBackedChatFingerprint(chatUrlMatchDomain);
  const headers = {
    "User-Agent": fingerprint.userAgent,
    Accept: "text/event-stream, application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    Origin: chatUrlMatchDomain === "duckduckgo.com" ? "https://duckduckgo.com" : `https://${chatUrlMatchDomain}`,
    Referer: chatUrlMatchDomain === "duckduckgo.com" ? "https://duckduckgo.com/" : `https://${chatUrlMatchDomain}/`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Ch-Ua": fingerprint.secChUa,
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": fingerprint.secChUaPlatform,
    Priority: "u=1, i"
  };
  if (cookieString) {
    headers["Cookie"] = cookieString;
  }
  let body;
  const parsedUrl = new URL(chatUrl);
  if (parsedUrl.hostname.includes("duckduckgo")) {
    body = JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: userMessage }]
    });
  } else {
    body = JSON.stringify({
      messages: [{ role: "user", content: userMessage }]
    });
  }
  try {
    const fetchStart = Date.now();
    if (!tlsClient.available) {
      return {
        status: 501,
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            error: {
              message: "httpBackedChat unavailable: wreq-js (TLS client) not installed",
              type: "configuration_error"
            }
          })
        ),
        isStealth: false,
        timing: {
          acquireContextMs: 0,
          navigateMs: 0,
          submitMs: Date.now() - t0,
          captureResponseMs: 0,
          totalMs: Date.now() - t0
        }
      };
    }
    const response = await tlsClient.fetch(chatUrl, {
      method: "POST",
      headers,
      body,
      signal: signal ?? void 0,
      sessionScope: req.poolKey
    });
    const fetchMs = Date.now() - fetchStart;
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new Error("Response too large");
      }
    }
    const responseBody = Buffer.from(await response.text());
    const responseStatus = response.status;
    const contentType = response.headers.get("content-type") || "text/event-stream";
    return {
      status: responseStatus,
      contentType,
      body: responseBody,
      isStealth: true,
      timing: {
        acquireContextMs: 0,
        navigateMs: 0,
        submitMs: fetchMs,
        captureResponseMs: 0,
        totalMs: Date.now() - t0
      }
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const msg = err instanceof Error ? err.message : String(err);
    const body2 = Buffer.from(
      JSON.stringify({
        error: {
          message: sanitizeErrorMessage(`httpBackedChat failed: ${msg}`),
          type: "upstream_error"
        }
      })
    );
    return {
      status: 502,
      contentType: "application/json",
      body: body2,
      isStealth: true,
      timing: {
        acquireContextMs: 0,
        navigateMs: 0,
        submitMs: 0,
        captureResponseMs: 0,
        totalMs: Date.now() - t0
      }
    };
  }
}
async function waitForCookiesWithPolling(context, cookieDomain, signal) {
  const deadline = Date.now() + COOKIE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const cookies = await context.cookies(cookieDomain);
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    if (cookieString) return cookieString;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await waitWithSignal(Math.min(COOKIE_POLL_INTERVAL_MS, remaining), signal);
  }
  return null;
}
async function doCookieRefreshOnContext(pooled, chatPageUrl, cookieDomain, signal) {
  const page = await openPage(pooled);
  try {
    await withAbort(
      page.goto(chatPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 6e4
      }),
      signal
    );
    return await waitForCookiesWithPolling(pooled.context, cookieDomain, signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return null;
  } finally {
    await page.close().catch(() => {
    });
  }
}
async function refreshCookiesViaBrowser(poolKey, chatPageUrl, cookieDomain, signal) {
  if (httpOverride !== null) return null;
  const cached = getCachedCookies(cookieDomain);
  if (cached) return cached;
  const pending = pendingRefreshes.get(poolKey);
  if (pending) return pending;
  const promise = doRefresh(poolKey, chatPageUrl, cookieDomain, signal);
  pendingRefreshes.set(poolKey, promise);
  promise.finally(() => pendingRefreshes.delete(poolKey));
  return promise;
}
async function doRefresh(poolKey, chatPageUrl, cookieDomain, signal) {
  const { key } = await settlePoolKey(poolKey, true);
  let pooled;
  try {
    pooled = await acquireBrowserContext(key, {
      cookieDomain,
      cookieString: null,
      warmupUrl: chatPageUrl
    });
  } catch {
    return null;
  }
  const result = await doCookieRefreshOnContext(pooled, chatPageUrl, cookieDomain, signal);
  if (result) setCachedCookies(cookieDomain, result);
  return result;
}
async function startBrowserWarmup(req) {
  if (!req.cookieDomain || httpOverride !== null) return null;
  const flag = process.env.OMNIROUTE_BROWSER_POOL;
  if (flag === "off" || flag === "0" || flag === "false") return null;
  try {
    const { key } = await settlePoolKey(req.poolKey, true);
    return await acquireBrowserContext(key, {
      cookieDomain: req.cookieDomain,
      cookieString: null
      // No warmupUrl — if httpBackedChat succeeds, the 1.5s warmup wait
      // would be wasted. Navigating fresh in doCookieRefreshOnContext
      // is fast once the browser context already exists.
    });
  } catch {
    return null;
  }
}
async function getFreshCookiesWithWarmup(poolKey, chatPageUrl, cookieDomain, signal, warmupPromise) {
  if (warmupPromise) {
    try {
      const pooled = await warmupPromise;
      if (pooled) {
        const result = await doCookieRefreshOnContext(pooled, chatPageUrl, cookieDomain, signal);
        if (result) {
          setCachedCookies(cookieDomain, result);
          return result;
        }
      }
    } catch {
    }
  }
  return refreshCookiesViaBrowser(poolKey, chatPageUrl, cookieDomain, signal);
}
function isChallengeResponse(status) {
  return status >= 400 && status !== 501;
}
async function tryBackedChat(req) {
  const abortController = req.signal ? null : new AbortController();
  const effectiveSignal = req.signal ?? abortController?.signal ?? null;
  if (abortController) {
    setTimeout(() => abortController.abort(), 45e3);
  }
  const warmupPromise = startBrowserWarmup(req);
  try {
    const fast = await httpBackedChat({ ...req, signal: effectiveSignal ?? void 0 });
    if (fast.status >= 200 && fast.status < 300) return fast;
    if (!isChallengeResponse(fast.status)) return fast;
    let freshCookie = null;
    if (req.cookieDomain) {
      freshCookie = getCachedCookies(req.cookieDomain);
      if (freshCookie) {
        const retry = await httpBackedChat({
          ...req,
          cookieString: freshCookie,
          signal: effectiveSignal ?? void 0
        });
        if (retry.status >= 200 && retry.status < 300) return retry;
        freshCookie = null;
      }
      if (!freshCookie) {
        freshCookie = await getFreshCookiesWithWarmup(
          req.poolKey,
          req.chatPageUrl,
          req.cookieDomain,
          effectiveSignal,
          warmupPromise
        );
        if (freshCookie) {
          const retry = await httpBackedChat({
            ...req,
            cookieString: freshCookie,
            signal: effectiveSignal ?? void 0
          });
          if (retry.status >= 200 && retry.status < 300) return retry;
        }
      }
    }
    const slowReq = freshCookie ? { ...req, cookieString: freshCookie, signal: effectiveSignal ?? void 0 } : { ...req, signal: effectiveSignal ?? void 0 };
    const slow = await browserBackedChat(slowReq);
    if (slow.status >= 200 && slow.status < 300) return slow;
    return slow;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        status: 504,
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            error: {
              message: "tryBackedChat timed out",
              type: "timeout_error"
            }
          })
        ),
        isStealth: false,
        timing: {
          acquireContextMs: 0,
          navigateMs: 0,
          submitMs: 0,
          captureResponseMs: 0,
          totalMs: 0
        }
      };
    }
    throw err;
  }
}
export {
  __resetBrowserBackedChatOverrideForTesting,
  __resetHttpBackedChatOverrideForTesting,
  __setBrowserBackedChatOverrideForTesting,
  __setHttpBackedChatOverrideForTesting,
  browserBackedChat,
  chatUrlMatcher,
  httpBackedChat,
  shutdownPool,
  tryBackedChat
};
