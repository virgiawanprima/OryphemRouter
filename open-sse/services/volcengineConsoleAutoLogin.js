import { randomUUID } from "crypto";
import { matchesCookieDomain } from "../utils/omni/cookieDomain.js";
const LOGIN_URL = "https://console.volcengine.com/auth/login";
const ARK_CONSOLE_URL = "https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan";
const REQUIRED_COOKIES = ["digest", "AccountID", "csrfToken", "userInfo"];
const DEFAULT_SESSION_TIMEOUT = 3e5;
const SUBMIT_COOKIE_TIMEOUT = 9e4;
const CAPTURE_POLL_INTERVAL = 1e3;
const RESEND_COOLDOWN_MS = 6e4;
const MAX_ACTIVE_SESSIONS = 2;
const SELECTORS = {
  phoneTab: ['.arco-tabs-header-title:has-text("\u624B\u673A\u53F7\u767B\u5F55")', "text=\u624B\u673A\u53F7\u767B\u5F55"],
  phoneInput: ["#Tel_input", 'input[name="Tel"]', 'input[placeholder*="\u624B\u673A\u53F7"]'],
  smsCodeInput: ["#Code_input", 'input[placeholder*="\u8BF7\u8F93\u5165\u9A8C\u8BC1\u7801"]'],
  sendCodeButton: ['button:has-text("\u83B7\u53D6\u9A8C\u8BC1\u7801")', "text=\u83B7\u53D6\u9A8C\u8BC1\u7801"],
  loginButton: ['button:has-text("\u767B\u5F55 / \u6CE8\u518C")', 'button:has-text("\u767B\u5F55")'],
  imageCaptchaInput: ["#VerificatonCodeInput", "input.verify-input"],
  captchaShot: [".arco-modal", '[class*="captcha"]', '[class*="verify"]'],
  /** Risk-control slider / popup heuristics */
  riskControl: [
    '[class*="secsdk-captcha"]',
    "#captcha_popup",
    '[class*="captcha-slider"]',
    '[class*="drag"] [class*="slider"]'
  ],
  /** MFA step-up modal (需要额外认证): a SECOND 6-digit SMS code is required */
  mfaModal: ['.arco-modal:has-text("\u9700\u8981\u989D\u5916\u8BA4\u8BC1")', "text=\u9700\u8981\u989D\u5916\u8BA4\u8BC1"],
  mfaInput: ["#VerificatonCodeInput", ".arco-modal input.verify-input", ".arco-modal input"],
  mfaConfirmButton: ['button:has-text("\u597D\u7684")', '.arco-modal button:has-text("\u786E\u5B9A")'],
  mfaResendButton: ['button:has-text("\u91CD\u53D1\u6821\u9A8C\u7801")'],
  /** TOTP binding modal (绑定MFA设备) — needs interactive Google Authenticator setup */
  mfaBindModal: ['.arco-modal:has-text("\u7ED1\u5B9AMFA\u8BBE\u5907")'],
  /** Identity selection page (/auth/login/select_identity) — the phone maps to
   *  multiple accounts; the user must pick which identity to log in as.
   *  Structure verified against the real auth bundle (vconsole-auth 1.0.0.2837,
   *  module 12173 + chunk 202): ul[class*=accountUl] > li[class*=accountLi] >
   *  div[class*=item] (click target) with the identity text in [class*=identity];
   *  submit is button[type=submit] ("登录") inside [class*=selectPlatformIdentity].
   *  .arco-list-item is kept as a fallback for future Arco-based redesigns. */
  identityList: ['ul[class*="accountUl"] li[class*="accountLi"]', ".arco-list-item"],
  identityItem: ['li[class*="accountLi"] > [class*="item"]', ".arco-list-item"],
  identitySubmitButton: [
    '[class*="selectPlatformIdentity"] button[type="submit"]',
    'button[type="submit"]:has-text("\u767B\u5F55")',
    'button:has-text("\u767B\u5F55")'
  ]
};
const IDENTITY_URL_PATTERN = /\/auth\/login\/select_identity/i;
const BROWSER_CONTEXT_OPTIONS = {
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
  viewport: { width: 1280, height: 800 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
};
function maskPhone(phone) {
  if (phone.length < 7) return "***";
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
function normalizePhone(raw) {
  const trimmed = String(raw || "").trim().replace(/[\s-]/g, "");
  const bare = trimmed.replace(/^\+?86/, "");
  return /^1\d{10}$/.test(bare) ? bare : null;
}
function isVolcengineCookieDomain(domain) {
  return matchesCookieDomain(domain, "volcengine.com");
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
class VolcengineConsoleAutoLoginService {
  sessions = /* @__PURE__ */ new Map();
  /** sessionId → bind promise set by the API layer to dedupe lazy binding */
  bindInFlight = /* @__PURE__ */ new Map();
  /** Injectable for tests — resolves the playwright module instead of `import("playwright")`. */
  loadPlaywright;
  delays;
  constructor(loadPlaywright = async () => import("playwright"), delays = {}) {
    this.loadPlaywright = loadPlaywright;
    this.delays = {
      pageSettleMs: delays.pageSettleMs ?? 2500,
      tabSwitchMs: delays.tabSwitchMs ?? 1e3,
      sendCodeSettleMs: delays.sendCodeSettleMs ?? 2e3,
      pollIntervalMs: delays.pollIntervalMs ?? CAPTURE_POLL_INTERVAL,
      resendCooldownMs: delays.resendCooldownMs ?? RESEND_COOLDOWN_MS
    };
  }
  // ─── Queries ─────────────────────────────────────────────────────────────
  getActiveSessionCount() {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (!isTerminal(session.phase)) count++;
    }
    return count;
  }
  getStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return this.toView(session);
  }
  /**
   * Lazy binding hook used by the API layer: the route stores a promise here
   * so concurrent status polls do not double-bind the same credentials.
   */
  async withBinding(sessionId, bind) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.phase !== "success" || !session.credentials) {
      return this.toView(session);
    }
    if (session.binding !== void 0) return this.toView(session);
    let inFlight = this.bindInFlight.get(sessionId);
    if (!inFlight) {
      inFlight = bind(session.credentials).then((binding) => {
        session.binding = binding;
        return binding;
      }).catch((error) => {
        session.binding = { error: errorMessage(error) };
        return session.binding;
      }).finally(() => {
        this.bindInFlight.delete(sessionId);
      });
      this.bindInFlight.set(sessionId, inFlight);
    }
    await inFlight;
    return this.toView(session);
  }
  // ─── Lifecycle ───────────────────────────────────────────────────────────
  async startLogin(phone, options) {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return { ok: false, error: "Invalid phone number (expected an 11-digit CN mobile number)" };
    }
    this.expireSessions();
    for (const session2 of this.sessions.values()) {
      if (session2.phone === normalized && !isTerminal(session2.phase)) {
        await this.cancel(session2.sessionId);
      }
    }
    if (this.getActiveSessionCount() >= MAX_ACTIVE_SESSIONS) {
      return { ok: false, error: "Too many concurrent Volcano login sessions" };
    }
    let playwright;
    try {
      playwright = await this.loadPlaywright();
    } catch {
      return {
        ok: false,
        error: "Playwright is not installed. Use manual browser login instead."
      };
    }
    const session = {
      sessionId: randomUUID(),
      phone: normalized,
      phase: "starting",
      error: null,
      captchaImage: null,
      resendAvailableAt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      timeoutMs: options?.timeout || DEFAULT_SESSION_TIMEOUT,
      credentials: null,
      cancelled: false,
      identityOptions: null,
      browser: null,
      context: null,
      page: null
    };
    this.sessions.set(session.sessionId, session);
    try {
      try {
        session.browser = await playwright.chromium.launch({
          headless: true,
          args: ["--disable-blink-features=AutomationControlled"]
        });
      } catch (launchError) {
        if (!/Executable doesn't exist/.test(String(launchError))) throw launchError;
        session.browser = await playwright.chromium.launch({
          headless: true,
          channel: "chrome",
          args: ["--disable-blink-features=AutomationControlled"]
        });
      }
      session.context = await session.browser.newContext(BROWSER_CONTEXT_OPTIONS);
      session.page = await session.context.newPage();
      session.page.setDefaultTimeout(15e3);
      await session.page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 3e4 });
      await sleep(this.delays.pageSettleMs);
      const tab = await this.firstVisible(session.page, SELECTORS.phoneTab);
      if (!tab) throw new SelectorMissError("phone tab");
      await tab.click();
      await sleep(this.delays.tabSwitchMs);
      const phoneInput = await this.firstVisible(session.page, SELECTORS.phoneInput);
      if (!phoneInput) throw new SelectorMissError("phone input");
      await phoneInput.fill(normalized);
      const sendBtn = await this.firstVisible(session.page, SELECTORS.sendCodeButton);
      if (!sendBtn) throw new SelectorMissError("send-code button");
      await sendBtn.click();
      session.phase = "sending_code";
      session.resendAvailableAt = Date.now() + this.delays.resendCooldownMs;
      await sleep(this.delays.sendCodeSettleMs);
      const risk = await this.firstVisible(session.page, SELECTORS.riskControl);
      if (risk) {
        session.captchaImage = await this.shot(session.page);
        session.phase = "fallback_manual";
        session.error = "Volcano risk control (slider captcha) was triggered in headless mode. Use manual browser login.";
        await this.closeBrowser(session);
        return { ok: true, session: this.toView(session) };
      }
      const captchaInput = await this.firstVisible(session.page, SELECTORS.imageCaptchaInput);
      if (captchaInput) {
        session.captchaImage = await this.shot(session.page);
        session.phase = "captcha_required";
      } else {
        session.phase = "waiting_code";
      }
      return { ok: true, session: this.toView(session) };
    } catch (error) {
      await this.closeBrowser(session);
      session.phase = error instanceof SelectorMissError ? "fallback_manual" : "error";
      session.error = errorMessage(error);
      if (session.phase === "fallback_manual") {
        session.error = `${session.error}. The login page layout may have changed \u2014 use manual browser login.`;
      }
      return { ok: true, session: this.toView(session) };
    }
  }
  async submitCode(sessionId, code, captcha, options) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const fromMfa = session.phase === "mfa_waiting";
    if (session.phase !== "waiting_code" && session.phase !== "captcha_required" && !fromMfa) {
      return this.toView(session);
    }
    const smsCode = String(code || "").trim();
    if (!/^\d{4,6}$/.test(smsCode)) {
      session.error = "Invalid SMS code";
      return this.toView(session);
    }
    if (session.phase === "captcha_required" && !String(captcha || "").trim()) {
      session.error = "Image captcha is required";
      return this.toView(session);
    }
    const page = session.page;
    if (!page) {
      session.phase = "error";
      session.error = "Browser session is gone \u2014 restart the login";
      return this.toView(session);
    }
    try {
      if (fromMfa) {
        const mfaInput = await this.firstVisible(page, SELECTORS.mfaInput);
        if (!mfaInput) throw new SelectorMissError("mfa code input");
        await mfaInput.fill(smsCode);
        const confirmBtn = await this.firstVisible(page, SELECTORS.mfaConfirmButton);
        if (!confirmBtn) throw new SelectorMissError("mfa confirm button");
        await confirmBtn.click();
      } else {
        const codeInput = await this.firstVisible(page, SELECTORS.smsCodeInput);
        if (!codeInput) throw new SelectorMissError("sms code input");
        await codeInput.fill(smsCode);
        if (captcha) {
          const captchaInput = await this.firstVisible(page, SELECTORS.imageCaptchaInput);
          if (captchaInput) await captchaInput.fill(String(captcha).trim());
        }
        const loginBtn = await this.firstVisible(page, SELECTORS.loginButton);
        if (!loginBtn) throw new SelectorMissError("login button");
        await loginBtn.click();
      }
      session.phase = "submitting";
      session.error = null;
      session.captchaImage = null;
      return await this.pollUntilResolved(session, {
        timeoutMs: options?.timeout || SUBMIT_COOKIE_TIMEOUT,
        fromMfa,
        detectIdentity: true
      });
    } catch (error) {
      session.phase = error instanceof SelectorMissError ? "fallback_manual" : "error";
      session.error = errorMessage(error);
      await this.closeBrowser(session);
      return this.toView(session);
    }
  }
  /**
   * Pick an identity on the console's /auth/login/select_identity page and
   * finish the login. `index` maps to the identityOptions list previously
   * returned in the session view.
   */
  async selectIdentity(sessionId, index, options) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.phase !== "identity_required") {
      return this.toView(session);
    }
    const page = session.page;
    if (!page) {
      session.phase = "error";
      session.error = "Browser session is gone \u2014 restart the login";
      return this.toView(session);
    }
    try {
      if (index > 0) {
        const itemSelector = await this.identityItemSelector(page);
        if (!itemSelector) throw new SelectorMissError("identity item");
        const items = page.locator(itemSelector);
        const count = await items.count();
        if (index < 0 || index >= count) {
          session.error = `Identity index ${index} is out of range (${count} options)`;
          return this.toView(session);
        }
        await items.nth(index).click();
        await sleep(this.delays.tabSwitchMs);
      }
      const submitBtn = await this.firstVisible(page, SELECTORS.identitySubmitButton);
      if (!submitBtn) throw new SelectorMissError("identity submit button");
      await submitBtn.click();
      session.phase = "submitting";
      session.error = null;
      session.identityOptions = null;
      return await this.pollUntilResolved(session, {
        timeoutMs: options?.timeout || SUBMIT_COOKIE_TIMEOUT,
        fromMfa: false,
        detectIdentity: false
      });
    } catch (error) {
      session.phase = error instanceof SelectorMissError ? "fallback_manual" : "error";
      session.error = errorMessage(error);
      await this.closeBrowser(session);
      return this.toView(session);
    }
  }
  /** First clickable identity-item selector that matches at least one element. */
  async identityItemSelector(page) {
    for (const selector of SELECTORS.identityItem) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) return selector;
      } catch {
      }
    }
    return null;
  }
  /**
   * Shared post-submit loop: waits for console cookies, watching for MFA
   * step-up, identity selection, TOTP binding, and console error toasts.
   */
  async pollUntilResolved(session, opts) {
    const page = session.page;
    if (!page) {
      session.phase = "error";
      session.error = "Browser session is gone \u2014 restart the login";
      return this.toView(session);
    }
    const deadline = Date.now() + opts.timeoutMs;
    let pollCount = 0;
    let navigatedAfterLogin = false;
    while (Date.now() < deadline) {
      if (session.cancelled) {
        session.phase = "cancelled";
        await this.closeBrowser(session);
        return this.toView(session);
      }
      if (Date.now() - session.createdAt > session.timeoutMs) {
        session.phase = "timeout";
        session.error = "Login timed out";
        await this.closeBrowser(session);
        return this.toView(session);
      }
      const cookies = await session.context.cookies();
      const credentials = {};
      for (const cookie of cookies) {
        if (REQUIRED_COOKIES.includes(cookie.name) && isVolcengineCookieDomain(cookie.domain)) {
          credentials[cookie.name] = cookie.value;
        }
      }
      if (REQUIRED_COOKIES.every((name) => credentials[name])) {
        session.credentials = credentials;
        session.phase = "success";
        await this.closeBrowser(session);
        return this.toView(session);
      }
      const bindModal = await this.firstVisible(page, SELECTORS.mfaBindModal);
      if (bindModal) {
        session.phase = "fallback_manual";
        session.error = "The console requires binding an MFA device (Google Authenticator). Use manual browser login to complete the one-time setup.";
        await this.closeBrowser(session);
        return this.toView(session);
      }
      if (!opts.fromMfa) {
        const mfaModal = await this.firstVisible(page, SELECTORS.mfaModal);
        if (mfaModal) {
          session.phase = "mfa_waiting";
          session.error = null;
          session.resendAvailableAt = Date.now() + this.delays.resendCooldownMs;
          return this.toView(session);
        }
      } else if (pollCount >= 5) {
        const mfaModal = await this.firstVisible(page, SELECTORS.mfaModal);
        if (mfaModal) {
          session.phase = "mfa_waiting";
          session.error = "The MFA code was not accepted \u2014 enter the latest code";
          session.resendAvailableAt = Date.now() + this.delays.resendCooldownMs;
          return this.toView(session);
        }
      }
      if (opts.detectIdentity && IDENTITY_URL_PATTERN.test(page.url())) {
        const options = await this.scrapeIdentityOptions(page);
        if (options.length > 0) {
          session.phase = "identity_required";
          session.error = null;
          session.identityOptions = options;
          return this.toView(session);
        }
      }
      if (!navigatedAfterLogin && pollCount >= 2 && !page.url().includes("/auth/login")) {
        navigatedAfterLogin = true;
        try {
          await page.goto(ARK_CONSOLE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 3e4
          });
        } catch {
        }
      }
      const toast = await page.locator('.arco-message-error, [class*="message-error"]').first().textContent({ timeout: 250 }).catch(() => null);
      if (toast && /验证码|密码|错误|失败|频繁/.test(toast)) {
        session.phase = "error";
        session.error = toast.trim().slice(0, 120);
        await this.closeBrowser(session);
        return this.toView(session);
      }
      await sleep(this.delays.pollIntervalMs);
      pollCount++;
    }
    session.phase = "timeout";
    session.error = await this.timeoutDiagnostics(session);
    await this.closeBrowser(session);
    return this.toView(session);
  }
  /** First identity-list selector that matches at least one element. */
  async identityListSelector(page) {
    for (const selector of SELECTORS.identityList) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) return selector;
      } catch {
      }
    }
    return null;
  }
  /** Scrape identity options from the select_identity page, in document order. */
  async scrapeIdentityOptions(page) {
    const selector = await this.identityListSelector(page);
    if (!selector) return [];
    const items = page.locator(selector);
    const count = await items.count();
    const options = [];
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent().catch(() => "") || "";
      const label = text.replace(/\s+/g, " ").trim();
      if (label) options.push({ index: i, label: label.slice(0, 100) });
    }
    return options;
  }
  /**
   * Build a diagnostic message for the cookie-poll timeout: page URL, cookies
   * collected so far, and any blocking modal. Keeps future debugging cheap.
   * When stuck on the identity-selection page, also dumps the page HTML to
   * /tmp so a selector miss can be fixed from ground truth in one shot.
   */
  async timeoutDiagnostics(session) {
    const parts = ["Timed out waiting for the console session cookies"];
    try {
      if (session.page) {
        parts.push(`url=${session.page.url()}`);
        const cookies = await session.context.cookies();
        const present = REQUIRED_COOKIES.filter(
          (name) => cookies.some((c) => c.name === name && isVolcengineCookieDomain(c.domain))
        );
        parts.push(
          `cookies=[${present.join(",") || "none of digest/AccountID/csrfToken/userInfo"}]`
        );
        const bindModal = await this.firstVisible(session.page, SELECTORS.mfaBindModal);
        if (bindModal) parts.push("blocked by \u7ED1\u5B9AMFA\u8BBE\u5907 modal");
        const mfaModal = await this.firstVisible(session.page, SELECTORS.mfaModal);
        if (mfaModal) parts.push("blocked by \u9700\u8981\u989D\u5916\u8BA4\u8BC1 modal");
        const risk = await this.firstVisible(session.page, SELECTORS.riskControl);
        if (risk) parts.push("blocked by risk-control slider");
        if (IDENTITY_URL_PATTERN.test(session.page.url())) {
          const dump = await this.dumpPageHtml(session);
          if (dump) parts.push(`identityPageHtml=${dump}`);
        }
      }
    } catch {
    }
    return parts.join(" \xB7 ");
  }
  /** Best-effort page HTML dump for debugging selector misses. */
  async dumpPageHtml(session) {
    try {
      const { writeFile } = await import("fs/promises");
      const path = `/tmp/omniroute-volc-select-identity-${session.sessionId.slice(0, 8)}.html`;
      await writeFile(path, await session.page.content(), "utf8");
      return path;
    } catch {
      return null;
    }
  }
  async resendCode(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const fromMfa = session.phase === "mfa_waiting";
    if (session.phase !== "waiting_code" && session.phase !== "captcha_required" && !fromMfa) {
      return this.toView(session);
    }
    if (Date.now() < session.resendAvailableAt) {
      return this.toView(session);
    }
    const page = session.page;
    if (!page) {
      session.phase = "error";
      session.error = "Browser session is gone \u2014 restart the login";
      return this.toView(session);
    }
    try {
      const resendSelectors = fromMfa ? [...SELECTORS.mfaResendButton] : [
        'button:has-text("\u83B7\u53D6\u9A8C\u8BC1\u7801")',
        'button:has-text("\u91CD\u53D1")',
        'button:has-text("\u91CD\u65B0\u83B7\u53D6")',
        'button:has-text("\u91CD\u65B0\u53D1\u9001")'
      ];
      const btn = await this.firstVisible(page, resendSelectors);
      if (!btn) throw new SelectorMissError("resend button");
      const disabled = await btn.isDisabled().catch(() => false);
      if (disabled) {
        session.error = "Resend is still cooling down on the login page";
        return this.toView(session);
      }
      await btn.click();
      session.resendAvailableAt = Date.now() + this.delays.resendCooldownMs;
      await sleep(this.delays.sendCodeSettleMs);
      if (fromMfa) {
        session.phase = "mfa_waiting";
        session.error = null;
        return this.toView(session);
      }
      const captchaInput = await this.firstVisible(page, SELECTORS.imageCaptchaInput);
      if (captchaInput) {
        session.captchaImage = await this.shot(page);
        session.phase = "captcha_required";
      } else {
        session.captchaImage = null;
        session.phase = "waiting_code";
      }
      session.error = null;
      return this.toView(session);
    } catch (error) {
      session.phase = "error";
      session.error = errorMessage(error);
      await this.closeBrowser(session);
      return this.toView(session);
    }
  }
  async cancel(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (isTerminal(session.phase)) return this.toView(session);
    session.cancelled = true;
    session.phase = "cancelled";
    await this.closeBrowser(session);
    return this.toView(session);
  }
  // ─── Internals ───────────────────────────────────────────────────────────
  toView(session) {
    const view = {
      sessionId: session.sessionId,
      phase: session.phase,
      phoneMasked: maskPhone(session.phone),
      error: session.error,
      captchaImage: session.phase === "captcha_required" ? session.captchaImage : null,
      resendAvailableAt: session.resendAvailableAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
    if (session.phase === "mfa_waiting") view.mfaRequired = true;
    if (session.phase === "identity_required" && session.identityOptions) {
      view.identityOptions = session.identityOptions;
    }
    if (session.phase === "success" && session.credentials) view.credentials = session.credentials;
    if (session.binding !== void 0) view.binding = session.binding;
    return view;
  }
  async closeBrowser(session) {
    try {
      await session.browser?.close?.();
    } catch {
    } finally {
      session.browser = null;
      session.context = null;
      session.page = null;
    }
  }
  /** Screenshot for captcha rendering; null when capture fails. */
  async shot(page) {
    try {
      const target = await this.firstVisible(page, SELECTORS.captchaShot);
      const buffer = target ? await target.screenshot({ type: "png" }) : await page.screenshot({ type: "png" });
      return buffer ? `data:image/png;base64,${buffer.toString("base64")}` : null;
    } catch {
      return null;
    }
  }
  async firstVisible(page, selectors) {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.isVisible({ timeout: 2e3 })) return locator;
      } catch {
      }
    }
    return null;
  }
  /** Close and drop sessions past their TTL; keep terminal ones briefly for status reads. */
  expireSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      const age = now - session.createdAt;
      const terminal = isTerminal(session.phase);
      if (terminal && age > 10 * 6e4) {
        this.sessions.delete(id);
      } else if (!terminal && age > session.timeoutMs + 6e4) {
        session.phase = "timeout";
        session.error = "Session expired";
        void this.closeBrowser(session);
        this.sessions.delete(id);
      }
    }
  }
}
class SelectorMissError extends Error {
  constructor(element) {
    super(`Login page element not found: ${element}`);
  }
}
function isTerminal(phase) {
  return phase === "success" || phase === "error" || phase === "timeout" || phase === "cancelled" || phase === "fallback_manual";
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
const volcengineConsoleAutoLoginService = new VolcengineConsoleAutoLoginService();
export {
  VolcengineConsoleAutoLoginService,
  isVolcengineCookieDomain,
  maskPhone,
  normalizePhone,
  volcengineConsoleAutoLoginService
};
