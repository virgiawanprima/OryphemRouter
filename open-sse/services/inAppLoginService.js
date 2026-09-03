import { EventEmitter } from "events";
import {
  TOKEN_EXTRACTION_CONFIGS
} from "./tokenExtractionConfig.js";
import { matchesCookieDomain } from "../utils/cookieDomain.js";
function captureConfiguredHeaders(tokenSources, requestHeaders, credentials) {
  for (const source of tokenSources) {
    if (source.type !== "header" || credentials[source.name]) continue;
    const value = requestHeaders[source.name.toLowerCase()];
    if (typeof value === "string" && value.trim()) {
      credentials[source.name] = value.trim();
    }
  }
}
class InAppLoginService extends EventEmitter {
  activeLogin = null;
  /**
   * Start a login flow for a web-cookie provider using Playwright.
   * @param providerId - e.g. "claude-web", "chatgpt-web"
   * @param options.timeout - Total timeout in ms (default: config value or 300s)
   */
  async startLogin(providerId, options) {
    const config = TOKEN_EXTRACTION_CONFIGS.get(providerId);
    if (!config) {
      this.emit("status", { providerId, status: "error", message: "No extraction config found" });
      return { success: false, error: `No extraction config for provider: ${providerId}` };
    }
    if (this.activeLogin) {
      this.emit("status", {
        providerId,
        status: "error",
        message: "A login is already in progress"
      });
      return { success: false, error: "A login process is already in progress" };
    }
    this.activeLogin = { providerId, aborted: false };
    this.emit("status", {
      providerId,
      status: "starting",
      message: `Opening ${config.displayName} login...`
    });
    try {
      const result = await this.runBrowserLogin(config, options?.timeout);
      this.emit("status", {
        providerId,
        status: result.success ? "complete" : "error",
        message: result.success ? "Credentials extracted successfully" : result.error || "Login failed"
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit("status", { providerId, status: "error", message });
      return { success: false, error: `Login failed: ${message}` };
    } finally {
      this.activeLogin = null;
    }
  }
  /**
   * Run the actual Playwright browser login flow
   */
  async runBrowserLogin(config, timeout) {
    const pollInterval = config.pollingConfig.pollInterval || 1e3;
    const maxTimeout = timeout || config.pollingConfig.timeout || 3e5;
    const minLoginTime = config.pollingConfig.minLoginTime || 5e3;
    const providerId = config.providerId;
    let playwright;
    try {
      playwright = await import("playwright");
    } catch {
      return {
        success: false,
        error: "Playwright is not installed. Use Electron for native login."
      };
    }
    if (this.activeLogin?.aborted) {
      return { success: false, error: "Login cancelled" };
    }
    this.emit("status", { providerId, status: "starting", message: "Launching browser..." });
    const browser = await playwright.chromium.launch({
      headless: false
      // User must interact with the login page
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: "en-US"
      });
      const page = await context.newPage();
      const credentials = {};
      page.on("request", (request) => {
        void request.allHeaders().then((headers) => captureConfiguredHeaders(config.tokenSources, headers, credentials)).catch(() => {
        });
      });
      this.emit("status", {
        providerId,
        status: "navigating",
        message: `Loading ${config.loginUrl}`
      });
      await page.goto(config.loginUrl, { waitUntil: "domcontentloaded", timeout: 3e4 });
      const maxPolls = Math.floor(maxTimeout / pollInterval);
      const startTime = Date.now();
      for (let i = 0; i < maxPolls; i++) {
        if (this.activeLogin?.aborted) {
          this.emit("status", {
            providerId,
            status: "cancelled",
            message: "Login cancelled by user"
          });
          return { success: false, error: "Login cancelled" };
        }
        if (i > 0 && i % 30 === 0) {
          this.emit("status", {
            providerId,
            status: "waiting",
            message: `Waiting for login... (${Math.round(i / 60)}m)`
          });
        }
        if (Date.now() - startTime < minLoginTime) {
          await sleep(pollInterval);
          continue;
        }
        const cookies = await context.cookies();
        const tokenSources = config.tokenSources;
        for (const source of tokenSources) {
          if (source.type === "cookie") {
            const domain = source.domain || void 0;
            const matched = cookies.find(
              (c) => c.name === source.name && (!domain || matchesCookieDomain(c.domain, domain))
            );
            if (matched && !credentials[source.name]) {
              credentials[source.name] = matched.value;
            }
          }
        }
        for (const source of tokenSources) {
          if (source.type === "localStorage" && !credentials[source.key]) {
            try {
              const value = await page.evaluate(
                (key) => localStorage.getItem(key),
                source.key
              );
              if (value && typeof value === "string") {
                credentials[source.key] = value;
              }
            } catch {
            }
          }
          if (source.type === "sessionStorage" && !credentials[source.key]) {
            try {
              const value = await page.evaluate(
                (key) => sessionStorage.getItem(key),
                source.key
              );
              if (value && typeof value === "string") {
                credentials[source.key] = value;
              }
            } catch {
            }
          }
        }
        const requiredKeys = tokenSources.map(
          (s) => s.type === "cookie" ? s.name : s.type === "localStorage" || s.type === "sessionStorage" ? s.key : s.name
        );
        const allFound = requiredKeys.every((k) => credentials[k] !== void 0);
        if (allFound && Object.keys(credentials).length > 0) {
          return { success: true, credentials };
        }
        if (config.successUrlPattern) {
          try {
            const currentUrl = page.url();
            if (config.successUrlPattern.test(currentUrl) && Object.keys(credentials).length > 0) {
              return { success: true, credentials };
            }
          } catch {
          }
        }
        await sleep(pollInterval);
      }
      return { success: false, error: "Login timed out" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit("status", { providerId, status: "error", message });
      return { success: false, error: `Login failed: ${message}` };
    } finally {
      await browser.close().catch(() => {
      });
    }
  }
  /**
   * Cancel the current login flow
   */
  cancel() {
    if (this.activeLogin) {
      this.emit("status", {
        providerId: this.activeLogin.providerId,
        status: "cancelled",
        message: "Login cancelled by user"
      });
      this.activeLogin.aborted = true;
      this.activeLogin = null;
    }
  }
  /**
   * Get the active provider ID, if any
   */
  getActiveProvider() {
    return this.activeLogin?.providerId || null;
  }
  /**
   * Check if a login flow is in progress
   */
  isActive() {
    return this.activeLogin !== null && !this.activeLogin.aborted;
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const inAppLoginService = new InAppLoginService();
export {
  InAppLoginService,
  captureConfiguredHeaders,
  inAppLoginService
};
