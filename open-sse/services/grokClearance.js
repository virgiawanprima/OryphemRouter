import { acquireBrowserContext } from "./browserPool.js";
const GROK_WARMUP_URL = "https://grok.com/";
const GROK_COOKIE_DOMAIN = ".grok.com";
const GROK_POOL_KEY = "grok-web";
function shouldUseGrokBrowserBacked() {
  const flag = process.env.WEB_COOKIE_USE_BROWSER;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  const poolFlag = process.env.OMNIROUTE_BROWSER_POOL;
  return poolFlag === "on" || poolFlag === "1" || poolFlag === "true";
}
let acquireOverride = null;
function __setGrokClearanceAcquireOverrideForTesting(fn) {
  acquireOverride = fn;
}
async function readCfClearanceFromContext(pooled) {
  const cookies = await pooled.context.cookies(GROK_WARMUP_URL);
  const match = cookies.find((c) => c.name === "cf_clearance");
  return match?.value || null;
}
async function acquireViaPool() {
  try {
    const pooled = await acquireBrowserContext(GROK_POOL_KEY, {
      cookieDomain: GROK_COOKIE_DOMAIN,
      cookieString: null,
      warmupUrl: GROK_WARMUP_URL
    });
    return await readCfClearanceFromContext(pooled);
  } catch {
    return null;
  }
}
async function acquireFreshGrokClearance(signal) {
  if (acquireOverride) return acquireOverride(signal);
  try {
    return await acquireViaPool();
  } catch {
    return null;
  }
}
export {
  __setGrokClearanceAcquireOverrideForTesting,
  acquireFreshGrokClearance,
  shouldUseGrokBrowserBacked
};
