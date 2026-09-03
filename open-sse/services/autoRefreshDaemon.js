import { TOKEN_EXTRACTION_CONFIGS } from "./tokenExtractionConfig.js";
import { log } from "../utils/log.js";
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1e3;
const MIN_CHECK_INTERVAL_MS = 60 * 1e3;
class AutoRefreshDaemon {
  timerId = null;
  running = false;
  checkIntervalMs;
  expiredCredentials = [];
  lastRun = null;
  /** In-memory store of web-cookie credentials (real persistence uses SQLite) */
  credentialStore = /* @__PURE__ */ new Map();
  constructor(checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS) {
    this.checkIntervalMs = Math.max(checkIntervalMs, MIN_CHECK_INTERVAL_MS);
  }
  /**
   * Register a credential for auto-refresh monitoring.
   * Called when credentials are extracted/updated.
   */
  registerCredential(providerId, value) {
    this.credentialStore.set(providerId, {
      providerId,
      value,
      storedAt: Date.now()
    });
  }
  /**
   * Remove a credential from monitoring (e.g., provider deleted)
   */
  unregisterCredential(providerId) {
    this.credentialStore.delete(providerId);
  }
  /**
   * Start the daemon — begins periodic credential checks
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.check().catch(() => {
    });
    this.timerId = setInterval(() => {
      this.check().catch(() => {
      });
    }, this.checkIntervalMs);
    this.timerId?.unref?.();
    log.info(
      "AUTO-REFRESH",
      `[AutoRefreshDaemon] Started \u2014 checking ${this.credentialStore.size} credentials every ${this.checkIntervalMs / 1e3}s`
    );
  }
  /**
   * Stop the daemon
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    log.info("AUTO-REFRESH", "[AutoRefreshDaemon] Stopped");
  }
  /**
   * Check all stored credentials for validity.
   * Makes a lightweight HEAD/GET request to the provider's home page.
   */
  async check() {
    this.lastRun = Date.now();
    const newlyExpired = [];
    const entries = [...this.credentialStore.entries()];
    for (const [providerId] of entries) {
      const config = TOKEN_EXTRACTION_CONFIGS.get(providerId);
      if (!config) {
        this.credentialStore.delete(providerId);
        continue;
      }
      try {
        const isValid = await this.validateCredential(providerId, config.homeUrl);
        if (!isValid) {
          newlyExpired.push(providerId);
          log.warn(
            "AUTO-REFRESH",
            `[AutoRefreshDaemon] Credential expired for "${providerId}" (${config.displayName})`
          );
        }
      } catch (err) {
        log.warn(
          "AUTO-REFRESH",
          `[AutoRefreshDaemon] Network error validating credential for "${providerId}" \u2014 retry next cycle`,
          err instanceof Error ? err.message : err
        );
      }
    }
    for (const id of newlyExpired) {
      if (!this.expiredCredentials.includes(id)) {
        this.expiredCredentials.push(id);
      }
    }
  }
  /**
   * Validate a credential by making a request to the provider's home page.
   * Returns true if the response suggests the credential is still valid.
   */
  async validateCredential(providerId, homeUrl) {
    const entry = this.credentialStore.get(providerId);
    if (!entry) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1e4);
    try {
      const response = await fetch(homeUrl, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
        }
      });
      if (response.status === 401 || response.status === 403) {
        return false;
      }
      return true;
    } catch (err) {
      log.warn(
        "AUTO-REFRESH",
        `[AutoRefreshDaemon] Network error validating credential for "${providerId}" \u2014 treated as valid (fail-open), will retry next cycle`,
        err instanceof Error ? err.message : err
      );
      return true;
    } finally {
      clearTimeout(timeout);
    }
  }
  /**
   * Get the current daemon status
   */
  getStatus() {
    return {
      running: this.running,
      checkedProviderCount: this.credentialStore.size,
      expiredCredentials: [...this.expiredCredentials],
      lastRun: this.lastRun
    };
  }
  /**
   * Clear expired credentials list (e.g., after re-authentication)
   */
  clearExpired() {
    this.expiredCredentials = [];
  }
  /**
   * Restart the daemon (useful when config changes)
   */
  restart() {
    this.stop();
    this.start();
  }
}
const autoRefreshDaemon = new AutoRefreshDaemon();
export {
  autoRefreshDaemon
};
