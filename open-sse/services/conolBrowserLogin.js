import { CONOL_SESSION_COOKIE_NAME } from "./conolAuth.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
const CONOL_HOME_URL = "https://conol.ai/home";
const DEFAULT_LOGIN_TIMEOUT_MS = 3e5;
const MIN_LOGIN_TIMEOUT_MS = 15e3;
const MAX_LOGIN_TIMEOUT_MS = 6e5;
const POLL_INTERVAL_MS = 1e3;
function clampTimeout(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LOGIN_TIMEOUT_MS;
  return Math.max(MIN_LOGIN_TIMEOUT_MS, Math.min(MAX_LOGIN_TIMEOUT_MS, Math.trunc(value)));
}
function extractConolBrowserCredentials(cookies) {
  const session = cookies.find(
    (candidate) => candidate.name === CONOL_SESSION_COOKIE_NAME && (!candidate.domain || candidate.domain === "conol.ai" || candidate.domain.endsWith(".conol.ai"))
  );
  const value = session?.value?.trim() || "";
  if (!value || /[\r\n;]/.test(value)) return null;
  return { cookie: `${CONOL_SESSION_COOKIE_NAME}=${value}` };
}
async function launchConolLoginBrowser(playwright) {
  const configuredPath = process.env.OMNIROUTE_LOGIN_BROWSER_PATH?.trim();
  const attempts = [
    ...configuredPath ? [{ headless: false, executablePath: configuredPath }] : [],
    { headless: false, channel: "chrome" },
    { headless: false, channel: "msedge" },
    { headless: false }
  ];
  let lastError;
  for (const options of attempts) {
    try {
      return await playwright.chromium.launch(options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No compatible browser is available for sign-in");
}
async function startConolBrowserLogin(requestedTimeout) {
  const timeout = clampTimeout(requestedTimeout);
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    return {
      success: false,
      error: "Browser sign-in is unavailable. Paste the Conol Cookie header instead."
    };
  }
  let browser = null;
  try {
    browser = await launchConolLoginBrowser(playwright);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "en-US"
    });
    const page = await context.newPage();
    await page.goto(CONOL_HOME_URL, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(timeout, 6e4)
    });
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const credentials = extractConolBrowserCredentials(
        await context.cookies(["https://conol.ai"])
      );
      if (credentials) return { success: true, credentials };
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return {
      success: false,
      error: "Conol sign-in timed out. Complete login in the opened browser and try again."
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizeErrorMessage(error instanceof Error ? error.message : error)
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
      }
    }
  }
}
export {
  extractConolBrowserCredentials,
  launchConolLoginBrowser,
  startConolBrowserLogin
};
