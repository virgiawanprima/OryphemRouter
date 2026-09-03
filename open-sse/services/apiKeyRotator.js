import { log } from "../utils/log.js";
const _keyIndexes = /* @__PURE__ */ new Map();
const _connectionExtraKeys = /* @__PURE__ */ new Map();
const MAX_KEY_HEALTH_ENTRIES = 500;
const MAX_CONNECTION_EXTRA_KEYS = 500;
function trackConnectionExtraKeys(connectionId, extraKeys) {
  const validExtras = extraKeys.filter((k) => typeof k === "string" && k.trim().length > 0);
  if (!_connectionExtraKeys.has(connectionId) && _connectionExtraKeys.size >= MAX_CONNECTION_EXTRA_KEYS) {
    const oldest = _connectionExtraKeys.keys().next().value;
    if (oldest !== void 0) _connectionExtraKeys.delete(oldest);
  }
  _connectionExtraKeys.set(connectionId, validExtras.length > 0);
}
function connectionHasExtraKeys(connectionId, extraKeys) {
  if (extraKeys && extraKeys.length > 0) return true;
  return _connectionExtraKeys.get(connectionId) ?? false;
}
const _keyHealth = /* @__PURE__ */ new Map();
const FAILURE_THRESHOLD = 2;
function getOrCreateHealth(connectionId, keyId) {
  const scopedKey = `${connectionId}:${keyId}`;
  if (!_keyHealth.has(scopedKey)) {
    if (_keyHealth.size >= MAX_KEY_HEALTH_ENTRIES) {
      const oldest = _keyHealth.keys().next().value;
      if (oldest !== void 0) _keyHealth.delete(oldest);
    }
    _keyHealth.set(scopedKey, {
      status: "active",
      failures: 0,
      lastFailure: null,
      lastSuccess: null,
      totalRequests: 0,
      totalFailures: 0
    });
  }
  return _keyHealth.get(scopedKey);
}
function getValidApiKey(connectionId, primaryKey, extraKeys = [], health) {
  const validExtras = extraKeys.filter((k) => typeof k === "string" && k.trim().length > 0);
  const allKeys = [];
  if (primaryKey) {
    const primaryHealth = health?.["primary"] || getOrCreateHealth(connectionId, "primary");
    if (primaryHealth.status !== "invalid") {
      allKeys.push({ key: primaryKey, keyId: "primary" });
    } else {
      log.warn(
        "KEY-ROTATOR",
        `[KeyRotator] Skipping invalid primary key for connection ${connectionId.slice(0, 8)}`
      );
    }
  }
  for (let i = 0; i < validExtras.length; i++) {
    const keyId = `extra_${i}`;
    const keyHealth = health?.[keyId] || getOrCreateHealth(connectionId, keyId);
    if (keyHealth.status !== "invalid") {
      allKeys.push({ key: validExtras[i], keyId });
    }
  }
  if (allKeys.length === 0) return null;
  if (allKeys.length === 1) {
    return { key: allKeys[0].key, keyId: allKeys[0].keyId };
  }
  const current = _keyIndexes.get(connectionId) ?? 0;
  const idx = current % allKeys.length;
  _keyIndexes.set(connectionId, current + 1);
  return { key: allKeys[idx].key, keyId: allKeys[idx].keyId };
}
function getRotatingApiKey(connectionId, primaryKey, extraKeys = []) {
  const validExtras = extraKeys.filter((k) => typeof k === "string" && k.trim().length > 0);
  if (validExtras.length === 0) return primaryKey;
  const allKeys = [primaryKey, ...validExtras].filter(Boolean);
  if (allKeys.length <= 1) return primaryKey;
  const current = _keyIndexes.get(connectionId) ?? 0;
  const idx = current % allKeys.length;
  _keyIndexes.set(connectionId, current + 1);
  return allKeys[idx];
}
function recordKeyFailure(connectionId, keyId) {
  const health = getOrCreateHealth(connectionId, keyId);
  health.failures++;
  health.totalRequests++;
  health.totalFailures++;
  health.lastFailure = (/* @__PURE__ */ new Date()).toISOString();
  if (health.failures >= FAILURE_THRESHOLD) {
    health.status = "invalid";
  } else if (health.failures > 0) {
    health.status = "warning";
  }
  return { ...health };
}
function recordKeyTerminal(connectionId, keyId) {
  const health = getOrCreateHealth(connectionId, keyId);
  health.failures = Math.max(health.failures + 1, FAILURE_THRESHOLD);
  health.totalRequests++;
  health.totalFailures++;
  health.lastFailure = (/* @__PURE__ */ new Date()).toISOString();
  health.status = "invalid";
  return { ...health };
}
function recordKeySuccess(connectionId, keyId) {
  const health = getOrCreateHealth(connectionId, keyId);
  health.failures = 0;
  health.totalRequests++;
  health.lastSuccess = (/* @__PURE__ */ new Date()).toISOString();
  health.status = "active";
  return { ...health };
}
function getInvalidKeyCount(health) {
  if (!health) return 0;
  return Object.values(health).filter((h) => h.status === "invalid").length;
}
function getKeyHealthStats(connectionId, primaryKey, extraKeys = [], health) {
  const total = (primaryKey ? 1 : 0) + extraKeys.filter((k) => k.trim().length > 0).length;
  const keys = ["primary", ...extraKeys.map((_, i) => `extra_${i}`)];
  let active = 0;
  let warning = 0;
  let invalid = 0;
  for (const keyId of keys) {
    const h = health?.[keyId] || getOrCreateHealth(connectionId, keyId);
    if (h.status === "active") active++;
    else if (h.status === "warning") warning++;
    else if (h.status === "invalid") invalid++;
  }
  return { total, active, warning, invalid };
}
function resetKeyStatus(connectionId, keyId) {
  const health = getOrCreateHealth(connectionId, keyId);
  health.failures = 0;
  health.status = "active";
  health.lastFailure = null;
  return { ...health };
}
function getAllKeyHealth() {
  const result = {};
  for (const [keyId, health] of _keyHealth.entries()) {
    result[keyId] = { ...health };
  }
  return result;
}
function syncHealthFromDB(connectionId, health) {
  if (!health) return;
  for (const [keyId, keyHealth] of Object.entries(health)) {
    const scopedKey = `${connectionId}:${keyId}`;
    if (!_keyHealth.has(scopedKey) && _keyHealth.size >= MAX_KEY_HEALTH_ENTRIES) {
      const oldest = _keyHealth.keys().next().value;
      if (oldest !== void 0) _keyHealth.delete(oldest);
    }
    _keyHealth.set(scopedKey, keyHealth);
  }
}
function recoverKeyHealth(connectionId, keyId, providerSpecificData) {
  const data = providerSpecificData && typeof providerSpecificData === "object" ? providerSpecificData : {};
  const health = data.apiKeyHealth;
  const currentHealth = health?.[keyId];
  if (!currentHealth || currentHealth.status === "active" && currentHealth.failures === 0) {
    return void 0;
  }
  syncHealthFromDB(connectionId, health);
  return {
    ...data,
    apiKeyHealth: { ...health, [keyId]: recordKeySuccess(connectionId, keyId) }
  };
}
function resetRotationIndex(connectionId) {
  _keyIndexes.delete(connectionId);
}
function getApiKeyCount(primaryKey, extraKeys = []) {
  const validExtras = extraKeys.filter((k) => typeof k === "string" && k.trim().length > 0);
  return (primaryKey ? 1 : 0) + validExtras.length;
}
function resolveKeyForRequest(connectionId, primaryKey, extraKeys, selectedKeyId) {
  if (selectedKeyId) {
    const health = getOrCreateHealth(connectionId, selectedKeyId);
    if (health.status !== "invalid") {
      if (selectedKeyId === "primary" && primaryKey) {
        return { key: primaryKey, keyId: "primary" };
      }
      const match = /^extra_(\d+)$/.exec(selectedKeyId);
      if (match) {
        const idx = Number.parseInt(match[1], 10);
        if (idx >= 0 && idx < extraKeys.length && extraKeys[idx].trim().length > 0) {
          return { key: extraKeys[idx], keyId: selectedKeyId };
        }
      }
    }
  }
  return getValidApiKey(connectionId, primaryKey, extraKeys);
}
function removeConnectionHealth(connectionId) {
  for (const key of _keyHealth.keys()) {
    if (key.startsWith(`${connectionId}:`)) {
      _keyHealth.delete(key);
    }
  }
}
function removeConnectionIndex(connectionId) {
  _keyIndexes.delete(connectionId);
  _connectionExtraKeys.delete(connectionId);
  for (const key of _keyHealth.keys()) {
    if (key.startsWith(`${connectionId}:`)) {
      _keyHealth.delete(key);
    }
  }
}
export {
  connectionHasExtraKeys,
  getAllKeyHealth,
  getApiKeyCount,
  getInvalidKeyCount,
  getKeyHealthStats,
  getRotatingApiKey,
  getValidApiKey,
  recordKeyFailure,
  recordKeySuccess,
  recordKeyTerminal,
  recoverKeyHealth,
  removeConnectionHealth,
  removeConnectionIndex,
  resetKeyStatus,
  resetRotationIndex,
  resolveKeyForRequest,
  syncHealthFromDB,
  trackConnectionExtraKeys
};
