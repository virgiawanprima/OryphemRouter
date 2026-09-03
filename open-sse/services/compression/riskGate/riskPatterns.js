const MAX_PEM_LEN = 4096;
const SELF_EVIDENT = /* @__PURE__ */ new Set([
  "private_key",
  "k8s_secret",
  "db_migration"
]);
const RISK_PATTERNS = [
  {
    category: "private_key",
    regex: new RegExp(
      `-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----[\\s\\S]{1,${MAX_PEM_LEN}}?-----END [A-Z0-9 ]{0,40}PRIVATE KEY-----`,
      "g"
    )
  },
  {
    category: "secret_assignment",
    regex: /\b(?:api[_-]?key|secret|token|password|passwd|bearer|authorization|client[_-]?secret)\b[ \t]{0,20}[:=][ \t]{0,20}["']?[A-Za-z0-9._\-+/]{8,200}/gi
  },
  {
    category: "stack_trace",
    regex: /^\s{0,8}(?:at\s+\S.{0,300}|File ".{1,300}", line \d{1,9}|Traceback \(most recent call last\):|[A-Za-z_.]{1,80}(?:Error|Exception):.{0,300})$/gm
  },
  {
    // Single DDL hit; the ">=2 DDL" promotion rule is enforced in riskGate.ts.
    category: "db_migration",
    regex: /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SCHEMA|DATABASE|COLUMN)\b/gi
  },
  {
    category: "legal",
    regex: /\bWITHOUT WARRANTY\b|\bPermission is hereby granted\b|^SPDX-License-Identifier:.{0,200}$|\bCopyright \(c\)\b|\bAll rights reserved\b/gim
  }
];
export {
  MAX_PEM_LEN,
  RISK_PATTERNS,
  SELF_EVIDENT
};
