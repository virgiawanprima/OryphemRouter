let operatorProviderErrorRules = {};
function setOperatorProviderErrorRules(rules) {
  operatorProviderErrorRules = {};
  if (!rules) return;
  for (const [provider, list] of Object.entries(rules)) {
    if (Array.isArray(list) && list.length > 0) {
      operatorProviderErrorRules[provider.toLowerCase()] = list;
    }
  }
}
function buildOpencodeRules() {
  return [
    {
      id: "opencode-monthly-quota-resets-in",
      match: ({ status, body }) => {
        if (status !== 429) return null;
        const text = JSON.stringify(body ?? "").toLowerCase();
        if (!text.includes("monthly usage limit reached")) return null;
        const cooldownMs = parseResetCountdownMs(text);
        if (cooldownMs === null) return null;
        return {
          reason: "quota_exhausted",
          scope: "connection",
          cooldownMs
        };
      }
    },
    {
      id: "opencode-quota-exhausted-headers",
      match: ({ status, headers }) => {
        if (status !== 429) return null;
        const remainingRequests = headers["x-ratelimit-remaining-requests"];
        if (remainingRequests === "0") {
          return { reason: "quota_exhausted", scope: "connection" };
        }
        const remainingTokens = headers["x-ratelimit-remaining-tokens"];
        if (remainingTokens === "0") {
          return { reason: "quota_exhausted", scope: "connection" };
        }
        return null;
      }
    },
    {
      id: "opencode-quota-exhausted-body",
      match: ({ status, body }) => {
        if (status !== 429) return null;
        const text = JSON.stringify(body ?? "").toLowerCase();
        if (text.includes("organization_quota_exceeded") || text.includes("account_quota_exceeded") || text.includes("plan_limit_reached")) {
          return { reason: "quota_exhausted", scope: "connection" };
        }
        return null;
      }
    }
  ];
}
function buildMinimaxRules() {
  return [
    {
      id: "minimax-per-model-quota",
      match: ({ status, headers }) => {
        if (status !== 429) return null;
        const headerVal = headers["x-model-quota-remaining"];
        if (!headerVal) return null;
        const exhausted = headerVal.split(",").some((pair) => pair.split("=")[1]?.trim() === "0");
        if (exhausted) {
          return { reason: "quota_exhausted", scope: "model" };
        }
        return null;
      }
    }
  ];
}
function buildCloudflareAiRules() {
  return [
    {
      id: "cloudflare-ai-daily-neuron-allocation",
      match: ({ status, body }) => {
        if (status !== 429) return null;
        const text = JSON.stringify(body ?? "").toLowerCase();
        if (!text.includes("daily free allocation")) return null;
        return { reason: "quota_exhausted", scope: "connection" };
      }
    }
  ];
}
function buildOpenrouterRules() {
  return [
    {
      id: "openrouter-credit-exhausted-402",
      match: ({ status }) => {
        if (status !== 402) return null;
        return { reason: "quota_exhausted", scope: "connection", cooldownMs: 2 * 60 * 1e3 };
      }
    }
  ];
}
function buildAgentrouterRules() {
  const AGENTROUTER_ERROR_STATUSES = /* @__PURE__ */ new Set([400, 403, 429]);
  return [
    {
      id: "agentrouter-user-quota-exhausted",
      match: ({ status, body }) => {
        if (!AGENTROUTER_ERROR_STATUSES.has(status)) return null;
        const text = JSON.stringify(body ?? "").toLowerCase();
        if (!text.includes("\u989D\u5EA6\u4E0D\u8DB3")) return null;
        return { reason: "quota_exhausted", scope: "connection" };
      }
    },
    {
      id: "agentrouter-model-access-denied",
      match: ({ status, body }) => {
        if (status !== 403) return null;
        const text = JSON.stringify(body ?? "").toLowerCase();
        if (!text.includes("\u65E0\u6743\u8BBF\u95EE\u6A21\u578B")) return null;
        return { reason: "auth_error", scope: "model", cooldownMs: 6 * 60 * 60 * 1e3 };
      }
    }
  ];
}
const providerRuleRegistry = /* @__PURE__ */ new Map([
  ["opencode", buildOpencodeRules()],
  ["opencode-go", buildOpencodeRules()],
  ["opencode-cli", buildOpencodeRules()],
  ["minimax", buildMinimaxRules()],
  ["minimax-passthrough", buildMinimaxRules()],
  ["cloudflare-ai", buildCloudflareAiRules()],
  ["openrouter", buildOpenrouterRules()],
  ["agentrouter", buildAgentrouterRules()]
]);
const HONORS_RULE_LOCK_SCOPE_PROVIDERS = /* @__PURE__ */ new Set(["agentrouter"]);
function honorsRuleLockScope(provider) {
  if (!provider) return false;
  const key = provider.toLowerCase();
  return HONORS_RULE_LOCK_SCOPE_PROVIDERS.has(key) || hasOperatorRuleForProvider(key);
}
const EGRESS_BUCKETED_LOCK_PROVIDERS = /* @__PURE__ */ new Set(["opencode", "opencode-go", "opencode-cli"]);
function isEgressBucketedLockScope(provider) {
  return !!provider && EGRESS_BUCKETED_LOCK_PROVIDERS.has(provider.toLowerCase());
}
function egressBucketedLockProviders() {
  return [...EGRESS_BUCKETED_LOCK_PROVIDERS].sort();
}
const FULL_TEXT_RULE_PROVIDERS = /* @__PURE__ */ new Set(["agentrouter"]);
function hasOperatorRuleForProvider(provider) {
  if (!provider) return false;
  const rules = operatorProviderErrorRules[provider.toLowerCase()];
  return !!rules && rules.length > 0;
}
function resolveRuleMatchBody(provider, structuredError, errorText) {
  if (provider && (FULL_TEXT_RULE_PROVIDERS.has(provider.toLowerCase()) || hasOperatorRuleForProvider(provider)) && errorText) {
    return errorText;
  }
  return structuredError ?? null;
}
function getProviderErrorRuleMatch(provider, status, headers, body, operatorRules) {
  if (!provider) return null;
  const key = provider.toLowerCase();
  const opRules = (operatorRules ?? operatorProviderErrorRules)?.[key];
  if (opRules && opRules.length > 0) {
    const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
    const lowered = text.toLowerCase();
    for (const r of opRules) {
      if (r.status === status && lowered.includes(r.match.toLowerCase())) {
        return {
          reason: r.reason ?? "quota_exhausted",
          scope: r.scope,
          cooldownMs: r.cooldownMs
        };
      }
    }
  }
  const rules = providerRuleRegistry.get(key);
  if (!rules) return null;
  const safeHeaders = !headers ? {} : typeof headers.get === "function" ? Object.fromEntries(headers.entries()) : Object.fromEntries(
    Object.entries(headers).map(([key2, value]) => [
      key2.toLowerCase(),
      value
    ])
  );
  for (const rule of rules) {
    const match = rule.match({ status, headers: safeHeaders, body });
    if (match) return match;
  }
  return null;
}
function parseResetCountdownMs(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const match = text.match(
    /resets?\s+in\s+(\d+)\s+(day|days|hour|hours|minute|minutes|second|seconds)\b/
  );
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = match[2];
  switch (unit) {
    case "day":
    case "days":
      return n * 864e5;
    case "hour":
    case "hours":
      return n * 36e5;
    case "minute":
    case "minutes":
      return n * 6e4;
    case "second":
    case "seconds":
      return n * 1e3;
    default:
      return null;
  }
}
export {
  egressBucketedLockProviders,
  getProviderErrorRuleMatch,
  hasOperatorRuleForProvider,
  honorsRuleLockScope,
  isEgressBucketedLockScope,
  parseResetCountdownMs,
  providerRuleRegistry,
  resolveRuleMatchBody,
  setOperatorProviderErrorRules
};
