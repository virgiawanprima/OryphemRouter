import { isIP } from "node:net";
import { getDbInstance } from "../utils/omni/dbCore.js";
let _config = {
  enabled: false,
  mode: "blacklist",
  blacklist: /* @__PURE__ */ new Set(),
  whitelist: /* @__PURE__ */ new Set(),
  tempBans: /* @__PURE__ */ new Map()
};
const IP_FILTER_NAMESPACE = "ipFilter";
const IP_FILTER_KEY = "config";
function ensureLoaded() {
  try {
    const row = getDbInstance().prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?").get(IP_FILTER_NAMESPACE, IP_FILTER_KEY);
    if (!row?.value) return;
    const parsed = JSON.parse(row.value);
    _config.enabled = parsed.enabled === true;
    if (typeof parsed.mode === "string") _config.mode = parsed.mode;
    _config.blacklist = new Set(Array.isArray(parsed.blacklist) ? parsed.blacklist : []);
    _config.whitelist = new Set(Array.isArray(parsed.whitelist) ? parsed.whitelist : []);
  } catch {
  }
}
function persist() {
  try {
    const payload = JSON.stringify({
      enabled: _config.enabled,
      mode: _config.mode,
      blacklist: Array.from(_config.blacklist),
      whitelist: Array.from(_config.whitelist)
    });
    getDbInstance().prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(IP_FILTER_NAMESPACE, IP_FILTER_KEY, payload);
  } catch {
  }
}
const _tempBanSweep = setInterval(() => {
  const now = Date.now();
  const bans = _config.tempBans;
  for (const [ip, entry] of bans) {
    if (now >= entry.until) bans.delete(ip);
  }
}, 6e4);
if (typeof _tempBanSweep === "object" && "unref" in _tempBanSweep) {
  _tempBanSweep.unref?.();
}
function configureIPFilter(config) {
  ensureLoaded();
  if (config.enabled !== void 0) _config.enabled = config.enabled;
  if (config.mode) _config.mode = config.mode;
  if (config.blacklist) _config.blacklist = new Set(config.blacklist);
  if (config.whitelist) _config.whitelist = new Set(config.whitelist);
  persist();
}
function getIPFilterConfig() {
  ensureLoaded();
  return {
    enabled: _config.enabled,
    mode: _config.mode,
    blacklist: Array.from(_config.blacklist),
    whitelist: Array.from(_config.whitelist),
    tempBans: Array.from(_config.tempBans.entries()).map(([ip, info]) => ({
      ip,
      until: new Date(info.until).toISOString(),
      reason: info.reason,
      remainingMs: Math.max(0, info.until - Date.now())
    }))
  };
}
function checkIP(ip) {
  ensureLoaded();
  if (!_config.enabled) return { allowed: true };
  if (!ip) return { allowed: true };
  const normalizedIP = normalizeIP(ip);
  const ban = _config.tempBans.get(normalizedIP);
  if (ban) {
    if (Date.now() < ban.until) {
      return { allowed: false, reason: `Temporarily banned: ${ban.reason}` };
    }
    _config.tempBans.delete(normalizedIP);
  }
  switch (_config.mode) {
    case "whitelist":
      if (!matchesAny(normalizedIP, _config.whitelist)) {
        return { allowed: false, reason: "IP not in whitelist" };
      }
      return { allowed: true };
    case "whitelist-priority":
      if (matchesAny(normalizedIP, _config.whitelist)) {
        return { allowed: true };
      }
      if (matchesAny(normalizedIP, _config.blacklist)) {
        return { allowed: false, reason: "IP blacklisted" };
      }
      return { allowed: true };
    case "blacklist":
    default:
      if (matchesAny(normalizedIP, _config.blacklist)) {
        return { allowed: false, reason: "IP blacklisted" };
      }
      return { allowed: true };
  }
}
function tempBanIP(ip, durationMs, reason = "Automated ban") {
  const normalizedIP = normalizeIP(ip);
  _config.tempBans.set(normalizedIP, {
    until: Date.now() + durationMs,
    reason
  });
}
function removeTempBan(ip) {
  _config.tempBans.delete(normalizeIP(ip));
}
function addToBlacklist(ip) {
  ensureLoaded();
  _config.blacklist.add(normalizeIP(ip));
  persist();
}
function removeFromBlacklist(ip) {
  ensureLoaded();
  _config.blacklist.delete(normalizeIP(ip));
  persist();
}
function addToWhitelist(ip) {
  ensureLoaded();
  _config.whitelist.add(normalizeIP(ip));
  persist();
}
function removeFromWhitelist(ip) {
  ensureLoaded();
  _config.whitelist.delete(normalizeIP(ip));
  persist();
}
function createIPFilterMiddleware() {
  return (req, res, next) => {
    const ip = extractClientIP(req);
    const { allowed, reason } = checkIP(ip);
    if (!allowed) {
      const statusCode = 403;
      if (res.status) {
        return res.status(statusCode).json({ error: reason || "Access denied" });
      }
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: reason || "Access denied" }));
    }
    if (next) next();
  };
}
function checkRequestIP(request, trustedPeerIp) {
  const ip = pickFirstValidIp(trustedPeerIp || null) || pickFirstValidIp(request.headers?.get?.("cf-connecting-ip")) || pickFirstValidIp(request.headers?.get?.("x-forwarded-for")) || pickFirstValidIp(request.headers?.get?.("x-real-ip")) || normalizeIP(request.ip || "") || "unknown";
  return checkIP(ip);
}
function normalizeIP(ip) {
  if (!ip) return "";
  return ip.replace(/^::ffff:/, "").trim();
}
function pickFirstValidIp(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) return null;
  const candidates = rawValue.split(",");
  for (const candidate of candidates) {
    const normalized = normalizeIP(candidate);
    if (normalized && isIP(normalized) !== 0) {
      return normalized;
    }
  }
  return null;
}
function matchesAny(ip, ipSet) {
  if (ipSet.has(ip)) return true;
  for (const entry of ipSet) {
    if (entry.includes("/") && matchesCIDR(ip, entry)) return true;
    if (entry.includes("*") && matchesWildcard(ip, entry)) return true;
  }
  return false;
}
function matchesCIDR(ip, cidr) {
  try {
    const [range, bits] = cidr.split("/");
    const mask = parseInt(bits, 10);
    if (isNaN(mask) || mask < 0 || mask > 32) return false;
    const ipNum = ipToNum(ip);
    const rangeNum = ipToNum(range);
    if (ipNum === null || rangeNum === null) return false;
    const maskBits = -1 << 32 - mask >>> 0;
    return (ipNum & maskBits) === (rangeNum & maskBits);
  } catch {
    return false;
  }
}
function ipToNum(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = num << 8 | n;
  }
  return num >>> 0;
}
function matchesWildcard(ip, pattern) {
  const ipParts = ip.split(".");
  const patParts = pattern.split(".");
  if (ipParts.length !== 4 || patParts.length !== 4) return false;
  return ipParts.every((part, i) => patParts[i] === "*" || part === patParts[i]);
}
function extractClientIP(req) {
  const headers = req.headers || {};
  return pickFirstValidIp(headers["cf-connecting-ip"]) || pickFirstValidIp(headers["x-forwarded-for"]) || pickFirstValidIp(headers["x-real-ip"]) || pickFirstValidIp(req.socket?.remoteAddress) || pickFirstValidIp(req.ip) || "unknown";
}
function resetIPFilter() {
  _config = {
    enabled: false,
    mode: "blacklist",
    blacklist: /* @__PURE__ */ new Set(),
    whitelist: /* @__PURE__ */ new Set(),
    tempBans: /* @__PURE__ */ new Map()
  };
}
export {
  addToBlacklist,
  addToWhitelist,
  checkIP,
  checkRequestIP,
  configureIPFilter,
  createIPFilterMiddleware,
  getIPFilterConfig,
  removeFromBlacklist,
  removeFromWhitelist,
  removeTempBan,
  resetIPFilter,
  tempBanIP
};
