import { FingerprintRotator } from "./fingerprintRotator.js";
import { Session } from "./session.js";
class SessionFactory {
  constructor(config) {
    this.config = config;
  }
  rotator = new FingerprintRotator();
  /**
   * Create a new session with the next available fingerprint.
   * For zero-auth providers, this is a lightweight operation
   * (just picks a fingerprint). For cookie-based providers this
   * would involve Playwright browser automation.
   */
  createSession() {
    const fingerprint = this.rotator.next();
    return new Session(
      fingerprint,
      this.config.cooldownBase,
      this.config.cooldownMax,
      this.config.cooldownJitter
    );
  }
  /** Reset the fingerprint rotator (e.g., after config change) */
  resetRotator() {
    this.rotator.reset();
  }
  /** Number of available fingerprint profiles */
  get profileCount() {
    return this.rotator.count;
  }
  /** Build headers from session fingerprint */
  buildHeaders(session, extra) {
    return session.buildHeaders(extra);
  }
}
export {
  SessionFactory
};
