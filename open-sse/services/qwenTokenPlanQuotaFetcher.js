import { registerQuotaFetcher, registerQuotaWindows } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
const DEFAULT_GATEWAY_HOST = "https://cs-data.qwencloud.com";
const DEFAULT_DASHBOARD_URL = "https://home.qwencloud.com/";
const CONSOLE_SITES = {
  qwencloud: {
    consoleSite: "QWENCLOUD",
    domain: "home.qwencloud.com",
    gatewayHost: DEFAULT_GATEWAY_HOST,
    dashboardUrl: DEFAULT_DASHBOARD_URL,
    origin: "https://home.qwencloud.com"
  },
  aliyun: {
    consoleSite: "ALIYUN",
    domain: "modelstudio.console.alibabacloud.com",
    gatewayHost: "https://bailian-singapore-cs.alibabacloud.com",
    dashboardUrl: "https://modelstudio.console.alibabacloud.com/",
    origin: "https://modelstudio.console.alibabacloud.com"
  }
};
const ALIYUN_CONSOLE_PROVIDERS = /* @__PURE__ */ new Set(["bailian-coding-plan", "alibaba", "alibaba-cn"]);
function resolveConsoleSite(cookie, provider) {
  if (/login_aliyunid_ticket=/.test(cookie)) return CONSOLE_SITES.aliyun;
  if (/login_qwencloud_ticket=/.test(cookie)) return CONSOLE_SITES.qwencloud;
  if (provider && ALIYUN_CONSOLE_PROVIDERS.has(provider)) return CONSOLE_SITES.aliyun;
  return CONSOLE_SITES.qwencloud;
}
const GATEWAY_REGION = "ap-southeast-1";
const GATEWAY_PRODUCT = "sfm_bailian";
const GATEWAY_ACTION = "IntlBroadScopeAspnGateway";
const COMMODITY_CODE = "sfm_tokenplansolo_public_intl";
const TOKEN_PLAN_API_PREFIX = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/";
const USAGE_CACHE_TTL_MS = 6e4;
const TIER_CACHE_TTL_MS = 60 * 6e4;
const QWEN_TOKEN_PLAN_WINDOW_5H = "window_5h";
const QWEN_TOKEN_PLAN_WINDOW_WEEKLY = "window_weekly";
const WINDOW_FIELD_MAP = {
  "5Hour": QWEN_TOKEN_PLAN_WINDOW_5H,
  "1Week": QWEN_TOKEN_PLAN_WINDOW_WEEKLY
};
const usageCache = /* @__PURE__ */ new Map();
const tierCache = /* @__PURE__ */ new Map();
const secTokenCache = /* @__PURE__ */ new Map();
const _cacheCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of usageCache) {
    if (now - entry.fetchedAt > USAGE_CACHE_TTL_MS * 5) usageCache.delete(key);
  }
  for (const [key, entry] of tierCache) {
    if (now - entry.fetchedAt > TIER_CACHE_TTL_MS * 2) tierCache.delete(key);
  }
  for (const [key, entry] of secTokenCache) {
    if (now - entry.fetchedAt > TIER_CACHE_TTL_MS * 2) secTokenCache.delete(key);
  }
}, 5 * 6e4);
if (typeof _cacheCleanup === "object" && "unref" in _cacheCleanup) {
  _cacheCleanup.unref?.();
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toNumberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function toTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function getCookie(providerSpecificData) {
  for (const key of ["qwenCloudCookie", "alibabaConsoleCookie", "cookie"]) {
    const value = toTrimmedString(providerSpecificData?.[key]);
    if (value) return value;
  }
  return process.env.QWEN_CLOUD_COOKIE?.trim() || "";
}
function getConfiguredSecToken(providerSpecificData) {
  for (const key of ["qwenCloudSecToken", "alibabaConsoleSecToken"]) {
    const value = toTrimmedString(providerSpecificData?.[key]);
    if (value) return value;
  }
  return process.env.QWEN_CLOUD_SEC_TOKEN?.trim() || "";
}
function getGatewayHost(site) {
  const configured = process.env.QWEN_TOKEN_PLAN_HOST?.trim();
  if (!configured) return site.gatewayHost;
  return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
}
function getDashboardUrl(site) {
  return process.env.QWEN_TOKEN_PLAN_DASHBOARD_URL?.trim() || site.dashboardUrl;
}
function extractQwenSecToken(html) {
  const match = /SEC_?TOKEN["']?\s*[:=]\s*["']([^"']+)["']/i.exec(html);
  return match ? match[1] : null;
}
async function resolveSecToken(connectionId, cookie, site) {
  const cached = secTokenCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < TIER_CACHE_TTL_MS) {
    return cached.token;
  }
  try {
    const response = await fetch(getDashboardUrl(site), {
      method: "GET",
      headers: {
        Cookie: cookie,
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8e3)
    });
    const html = await response.text();
    const token = extractQwenSecToken(html);
    if (token) {
      secTokenCache.set(connectionId, { token, fetchedAt: Date.now() });
      return token;
    }
  } catch {
  }
  return "";
}
async function callGateway(endpoint, cookie, secToken, site) {
  const api = `${TOKEN_PLAN_API_PREFIX}${endpoint}`;
  const url = `${getGatewayHost(site)}/data/api.json?product=${GATEWAY_PRODUCT}&action=${GATEWAY_ACTION}&api=${encodeURIComponent(api)}`;
  const params = JSON.stringify({
    Api: api,
    V: "1.0",
    Data: {
      commodityCode: COMMODITY_CODE,
      cornerstoneParam: {
        console: "ONE_CONSOLE",
        consoleSite: site.consoleSite,
        domain: site.domain,
        productCode: "p_efm",
        protocol: "V2",
        xsp_lang: "en-US"
      }
    }
  });
  const body = new URLSearchParams({
    product: GATEWAY_PRODUCT,
    action: GATEWAY_ACTION,
    sec_token: secToken,
    region: GATEWAY_REGION,
    params
  });
  try {
    await throttleQuotaFetch();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Origin: site.origin,
        Referer: `${site.origin}/`
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8e3)
    });
    const raw = await response.json();
    return parseGatewayEnvelope(raw);
  } catch {
    return null;
  }
}
function parseGatewayEnvelope(raw) {
  const obj = toRecord(raw);
  if (obj["code"] !== "200" && obj["code"] !== 200) return null;
  const inner = toRecord(toRecord(toRecord(obj["data"])["DataV2"])["data"]);
  if (inner["code"] !== "SUCCESS" || inner["success"] !== true) return null;
  return inner["data"] ?? null;
}
function parseUsageWindows(payload) {
  const obj = toRecord(payload);
  const windows = {};
  for (const [fieldPrefix, windowKey] of Object.entries(WINDOW_FIELD_MAP)) {
    const percent = toNumberOrNull(obj[`per${fieldPrefix}Percentage`]);
    if (percent === null) continue;
    const resetMs = toNumberOrNull(obj[`per${fieldPrefix}ResetTime`]);
    windows[windowKey] = {
      percentUsed: percent,
      resetAt: resetMs && resetMs > 0 ? new Date(resetMs).toISOString() : null
    };
  }
  return windows;
}
async function resolveTierInfo(connectionId, cookie, secToken, site) {
  const cached = tierCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < TIER_CACHE_TTL_MS) {
    return cached;
  }
  const [quotaConfig, subscription] = await Promise.all([
    callGateway("quota-config", cookie, secToken, site),
    callGateway("subscription", cookie, secToken, site)
  ]);
  const specCode = toTrimmedString(toRecord(subscription)["specCode"]) || null;
  const tierRecord = specCode ? toRecord(toRecord(quotaConfig)[specCode]) : {};
  const entry = {
    specCode,
    tierLimits: {
      fiveHour: toNumberOrNull(tierRecord["five_hour"]),
      weekly: toNumberOrNull(tierRecord["weekly"])
    },
    fetchedAt: Date.now()
  };
  tierCache.set(connectionId, entry);
  return entry;
}
async function fetchQwenTokenPlanQuota(connectionId, connection) {
  const cached = usageCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < USAGE_CACHE_TTL_MS) {
    return cached.quota;
  }
  const providerSpecificData = connection?.providerSpecificData && typeof connection.providerSpecificData === "object" && !Array.isArray(connection.providerSpecificData) ? connection.providerSpecificData : void 0;
  const cookie = getCookie(providerSpecificData);
  if (!cookie) return null;
  const site = resolveConsoleSite(
    cookie,
    typeof connection?.provider === "string" ? connection.provider : void 0
  );
  const secToken = getConfiguredSecToken(providerSpecificData) || await resolveSecToken(connectionId, cookie, site);
  const usagePayload = await callGateway("usage", cookie, secToken, site);
  if (usagePayload === null) return null;
  const windows = parseUsageWindows(usagePayload);
  const windowEntries = Object.values(windows);
  if (windowEntries.length === 0) return null;
  const worst = windowEntries.reduce((max, w) => w.percentUsed > max.percentUsed ? w : max);
  const tier = await resolveTierInfo(connectionId, cookie, secToken, site);
  const total = tier.tierLimits.weekly ?? 100;
  const quota = {
    used: Math.round(worst.percentUsed * total),
    total,
    percentUsed: worst.percentUsed,
    resetAt: worst.resetAt,
    windows,
    consoleSite: site.consoleSite,
    specCode: tier.specCode,
    tierLimits: tier.tierLimits,
    limitReached: worst.percentUsed >= 1
  };
  usageCache.set(connectionId, { quota, fetchedAt: Date.now() });
  return quota;
}
function invalidateQwenTokenPlanQuotaCache(connectionId) {
  usageCache.delete(connectionId);
  tierCache.delete(connectionId);
  secTokenCache.delete(connectionId);
}
function registerQwenTokenPlanQuotaFetcher() {
  registerQuotaFetcher("qwen-cloud-token-plan", fetchQwenTokenPlanQuota);
  registerMonitorFetcher("qwen-cloud-token-plan", fetchQwenTokenPlanQuota);
  registerQuotaWindows("qwen-cloud-token-plan", [
    QWEN_TOKEN_PLAN_WINDOW_5H,
    QWEN_TOKEN_PLAN_WINDOW_WEEKLY
  ]);
}
export {
  QWEN_TOKEN_PLAN_WINDOW_5H,
  QWEN_TOKEN_PLAN_WINDOW_WEEKLY,
  extractQwenSecToken,
  fetchQwenTokenPlanQuota,
  invalidateQwenTokenPlanQuotaCache,
  registerQwenTokenPlanQuotaFetcher,
  resolveConsoleSite
};
