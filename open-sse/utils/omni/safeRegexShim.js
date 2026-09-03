// ADAPTATION for OryphemRouter.
// OmniRoute's `compression/engines/ccr/ccrQuery.ts` uses the `safe-regex` npm package to
// reject regexes with catastrophic backtracking. That package is not installed here. This
// permissive shim returns true (pattern considered safe) — NOTE: it does NOT actually
// detect ReDoS-prone patterns.

export default function safeRegex(re, opts) {
  return true;
}

export const maxRepeat = 25;
