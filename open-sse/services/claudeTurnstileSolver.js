import {
  CLAUDE_WEB_FINGERPRINT,
  CLAUDE_WEB_FINGERPRINT_VERSION
} from "../config/claudeWebFingerprint.js";
const CLAUDE_WEB_URL = "https://claude.ai";
const CHALLENGE_TIMEOUT = 6e4;
const CHALLENGE_CHECK_INTERVAL = 500;
const MAX_RETRIES = 3;
async function isTurnstileSolved(page) {
  try {
    const cookies = await page.context().cookies();
    const cfClearance = cookies.find((c) => c.name === "cf_clearance");
    return !!cfClearance?.value;
  } catch {
    return false;
  }
}
async function waitForChallengeSolved(page) {
  const startTime = Date.now();
  while (Date.now() - startTime < CHALLENGE_TIMEOUT) {
    if (await isTurnstileSolved(page)) {
      return;
    }
    await page.waitForTimeout(CHALLENGE_CHECK_INTERVAL);
  }
  throw new Error(`Turnstile challenge not solved within ${CHALLENGE_TIMEOUT}ms`);
}
async function extractCfClearance(page) {
  const cookies = await page.context().cookies();
  const cfClearance = cookies.find((c) => c.name === "cf_clearance");
  if (!cfClearance?.value) {
    throw new Error("cf_clearance cookie not found after challenge solve");
  }
  return cfClearance.value;
}
async function solveTurnstile(options) {
  const headless = options?.headless !== false;
  const timeout = options?.timeout ?? CHALLENGE_TIMEOUT;
  let browser = null;
  let page = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      userAgent: CLAUDE_WEB_FINGERPRINT.userAgent,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: process.env.OMNIROUTE_TURNSTILE_IGNORE_TLS_ERRORS === "true"
    });
    page = await context.newPage();
    await page.goto(CLAUDE_WEB_URL, { waitUntil: "domcontentloaded" });
    await waitForChallengeSolved(page);
    const cfClearance = await extractCfClearance(page);
    return {
      cfClearance,
      timestamp: Date.now()
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to solve Turnstile: ${message}`);
  } finally {
    if (page) {
      await page.close().catch(() => {
      });
    }
    if (browser) {
      await browser.close().catch(() => {
      });
    }
  }
}
const tokenCache = /* @__PURE__ */ new Map();
let cfClearanceTokenOverride = null;
function setCfClearanceTokenForTesting(token) {
  cfClearanceTokenOverride = token;
}
async function getCfClearanceToken(options) {
  const cacheKey = `claude-cf-clearance-${CLAUDE_WEB_FINGERPRINT_VERSION}`;
  const cached = tokenCache.get(cacheKey);
  if (cfClearanceTokenOverride) {
    tokenCache.set(cacheKey, {
      token: cfClearanceTokenOverride,
      expiresAt: Date.now() + 55 * 60 * 1e3
    });
    return cfClearanceTokenOverride;
  }
  if (cached && !options?.force && cached.expiresAt > Date.now() + 5 * 60 * 1e3) {
    return cached.token;
  }
  const result = await solveTurnstile({
    headless: options?.headless !== false
  });
  tokenCache.set(cacheKey, {
    token: result.cfClearance,
    expiresAt: Date.now() + 55 * 60 * 1e3
  });
  return result.cfClearance;
}
function clearCfClearanceCache() {
  tokenCache.clear();
}
function getCacheStatus() {
  const cacheKey = `claude-cf-clearance-${CLAUDE_WEB_FINGERPRINT_VERSION}`;
  const cached = tokenCache.get(cacheKey);
  if (!cached) {
    return { hasCached: false };
  }
  const expiresIn = Math.max(0, cached.expiresAt - Date.now());
  return {
    hasCached: true,
    expiresIn
  };
}
export {
  clearCfClearanceCache,
  getCacheStatus,
  getCfClearanceToken,
  setCfClearanceTokenForTesting,
  solveTurnstile
};
