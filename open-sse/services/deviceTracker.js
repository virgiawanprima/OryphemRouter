import { createHash } from "node:crypto";
const DEFAULT_TTL_MS = 30 * 60 * 1e3;
const CLEANUP_INTERVAL_MS = 60 * 1e3;
const DEFAULT_MAX_DEVICES_PER_API_KEY = 1e3;
const DEFAULT_MAX_TOTAL_DEVICES = 1e4;
const MAX_STORED_USER_AGENT_LENGTH = 256;
const TTL_ENV_NAME = "DEVICE_TRACKER_TTL_MS";
const MAX_PER_KEY_ENV_NAME = "DEVICE_TRACKER_MAX_DEVICES_PER_KEY";
const MAX_TOTAL_ENV_NAME = "DEVICE_TRACKER_MAX_TOTAL_DEVICES";
function parseTtlMs() {
  const rawValue = process.env[TTL_ENV_NAME];
  if (!rawValue) return DEFAULT_TTL_MS;
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return DEFAULT_TTL_MS;
  return parsedValue;
}
function parsePositiveIntegerEnv(envName, defaultValue) {
  const rawValue = process.env[envName];
  if (!rawValue) return defaultValue;
  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) return defaultValue;
  return parsedValue;
}
let ttlMs = parseTtlMs();
let maxDevicesPerApiKey = parsePositiveIntegerEnv(
  MAX_PER_KEY_ENV_NAME,
  DEFAULT_MAX_DEVICES_PER_API_KEY
);
let maxTotalDevices = parsePositiveIntegerEnv(MAX_TOTAL_ENV_NAME, DEFAULT_MAX_TOTAL_DEVICES);
const devicesByApiKey = /* @__PURE__ */ new Map();
let cleanupTimer = null;
function maskIp(ip) {
  if (!ip || ip === "unknown") return "unknown";
  const ipv4Parts = ip.split(".");
  if (ipv4Parts.length === 4 && ipv4Parts.every((part) => /^\d{1,3}$/.test(part))) {
    return `${ipv4Parts[0]}.${ipv4Parts[1]}.x.x`;
  }
  if (ip.includes(":")) {
    const visibleGroups = ip.split(":").filter(Boolean).slice(0, 3).join(":");
    return visibleGroups ? `${visibleGroups}:...` : "unknown";
  }
  return "masked";
}
function truncateUserAgent(userAgent) {
  if (userAgent.length <= MAX_STORED_USER_AGENT_LENGTH) return userAgent;
  return `${userAgent.slice(0, MAX_STORED_USER_AGENT_LENGTH)}...`;
}
function createFingerprint(ip, userAgent) {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}
function getTotalDeviceCount() {
  let count = 0;
  for (const devices of devicesByApiKey.values()) count += devices.size;
  return count;
}
function deleteDevice(apiKeyId, fingerprint) {
  const devices = devicesByApiKey.get(apiKeyId);
  if (!devices) return false;
  const deleted = devices.delete(fingerprint);
  if (devices.size === 0) devicesByApiKey.delete(apiKeyId);
  return deleted;
}
function findOldestDevice(apiKeyId) {
  let oldest = null;
  const entries = apiKeyId ? [[apiKeyId, devicesByApiKey.get(apiKeyId)]] : devicesByApiKey.entries();
  for (const [entryApiKeyId, devices] of entries) {
    if (!devices) continue;
    for (const [fingerprint, record] of devices.entries()) {
      if (!oldest || record.lastSeen < oldest.lastSeen) {
        oldest = { apiKeyId: entryApiKeyId, fingerprint, lastSeen: record.lastSeen };
      }
    }
  }
  return oldest;
}
function evictOldestDevice(apiKeyId = null) {
  const oldest = findOldestDevice(apiKeyId);
  if (!oldest) return false;
  return deleteDevice(oldest.apiKeyId, oldest.fingerprint);
}
function enforceDeviceLimits(apiKeyId, devices) {
  while (devices.size >= maxDevicesPerApiKey) {
    if (!evictOldestDevice(apiKeyId)) break;
  }
  while (getTotalDeviceCount() >= maxTotalDevices) {
    if (!evictOldestDevice()) break;
  }
}
function expireDevices(now = Date.now()) {
  let expiredCount = 0;
  for (const [apiKeyId, devices] of devicesByApiKey.entries()) {
    for (const [fingerprint, record] of devices.entries()) {
      if (now - record.lastSeen > ttlMs) {
        devices.delete(fingerprint);
        expiredCount += 1;
      }
    }
    if (devices.size === 0) devicesByApiKey.delete(apiKeyId);
  }
  return expiredCount;
}
function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    expireDevices();
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
}
ensureCleanupTimer();
function extractIpFromHeaders(headers) {
  if (!headers) return "unknown";
  const getHeader = (name) => {
    if (headers instanceof Headers) return headers.get(name);
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name && typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return null;
  };
  const edgeIp = getHeader("cf-connecting-ip") || getHeader("x-real-ip") || getHeader("fastly-client-ip");
  if (edgeIp) return edgeIp;
  const forwardedFor = getHeader("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return "unknown";
}
function trackDevice(apiKeyId, ip, userAgent) {
  if (!apiKeyId || typeof apiKeyId !== "string") return null;
  const now = Date.now();
  expireDevices(now);
  const resolvedIp = ip && ip.trim() ? ip.trim() : "unknown";
  const resolvedUserAgent = userAgent && userAgent.trim() ? userAgent.trim() : "unknown";
  const fingerprint = createFingerprint(resolvedIp, resolvedUserAgent);
  let devices = devicesByApiKey.get(apiKeyId);
  if (!devices) {
    devices = /* @__PURE__ */ new Map();
    devicesByApiKey.set(apiKeyId, devices);
  }
  const existingRecord = devices.get(fingerprint);
  if (existingRecord) {
    existingRecord.lastSeen = now;
  } else {
    enforceDeviceLimits(apiKeyId, devices);
    if (!devicesByApiKey.has(apiKeyId)) devicesByApiKey.set(apiKeyId, devices);
    devices.set(fingerprint, {
      fingerprint,
      ip: maskIp(resolvedIp),
      userAgent: truncateUserAgent(resolvedUserAgent),
      lastSeen: now
    });
  }
  return fingerprint;
}
function getDeviceCount(apiKeyId) {
  expireDevices();
  if (!apiKeyId || typeof apiKeyId !== "string") return 0;
  return devicesByApiKey.get(apiKeyId)?.size || 0;
}
function getDeviceDetails(apiKeyId) {
  expireDevices();
  if (!apiKeyId || typeof apiKeyId !== "string") return [];
  const devices = devicesByApiKey.get(apiKeyId);
  if (!devices) return [];
  return Array.from(devices.values()).map((record) => ({
    fingerprint: record.fingerprint.slice(0, 12),
    ip: record.ip,
    userAgent: record.userAgent,
    lastSeen: record.lastSeen
  }));
}
function getAllDeviceCounts() {
  expireDevices();
  const counts = {};
  for (const [apiKeyId, devices] of devicesByApiKey.entries()) {
    counts[apiKeyId] = devices.size;
  }
  return counts;
}
function clearDeviceTracker() {
  devicesByApiKey.clear();
  ttlMs = parseTtlMs();
  maxDevicesPerApiKey = parsePositiveIntegerEnv(
    MAX_PER_KEY_ENV_NAME,
    DEFAULT_MAX_DEVICES_PER_API_KEY
  );
  maxTotalDevices = parsePositiveIntegerEnv(MAX_TOTAL_ENV_NAME, DEFAULT_MAX_TOTAL_DEVICES);
}
export {
  clearDeviceTracker,
  expireDevices,
  extractIpFromHeaders,
  getAllDeviceCounts,
  getDeviceCount,
  getDeviceDetails,
  maskIp,
  trackDevice
};
