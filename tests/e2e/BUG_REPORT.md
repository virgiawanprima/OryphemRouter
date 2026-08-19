# Bug Hunting Report — OryphemRouter Codebase Analysis

**Date:** 2026-08-19  
**Scope:** Full codebase review + systematic bug hunt using `systematic-debugging` skills

---

## Priority 1: Theme Transition Bug (Fixed) ✅

### Root Cause
The light palette CSS was scoped to `.theme-light` (a class never applied anywhere), so light mode never rendered even though the toggle button flipped the `.dark` class and persisted state correctly.

### Fixes Applied
1. **`src/app/globals.css`:** Light palette overrides now target `html:not(.dark)` directly instead of `.theme-light` elements
2. **Sidebar vibrancy:** Added light/dark variants for `.bg-vibrancy` class
3. **Universal transitions:** Added global `*, *::before, *::after { transition: background-color/border-color/color/... 0.2s }` respecting existing `.no-anim` (reduced motion preference)
4. **Pre-hydration script:** Added inline theme restoration in `<head>` of `layout.js` to avoid flash (light→dark snap on first load)

### Verification
- Dark→light→dark toggle flips body + sidebar on both prod (3000) & dev (20129)
- Persists across full page reload
- 0 console errors
- All 4 theme e2e tests pass (CSS tokens match Dracula palette, visible toggle, persistence, transitions)

---

## Secondary Bugs Found & Fixed ✅

| # | File/Component | Bug Description | Fix Applied | Verified |
|---|----------------|-----------------|-------------|----------|
| 1 | `src/shared/components/StatusBar.js` | Hardcoded port `20129` displayed | Now reads actual `window.location.port` | Console log shows dynamic port |
| 2 | `src/lib/db/repos/usageRepo.js` | `getRecentLogs()` showed raw model IDs (e.g., `gpt-4o`) | Mapped to documented display names via `findModelName()` | Usage page & logs show "GPT-4o", "Claude Sonnet 4.6 (Thinking)", etc. |
| 3 | `src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/EmbeddingExampleCard.js` | Response rendered as raw JSON `<pre>` (spec 0e violation) | Replaced with formatted UI: model badge + dimension count + token usage badges + vector preview chips; raw payload kept only for Copy action | Embedding card passes no-raw-json test, renders nicely in browser |
| 4 | `src/shared/hooks/useRealtime.js` | React 19 hook-rule lint noise (`onEventRef.current = onEvent` during render) | Moved ref update into `useEffect` body | ESLint clean, build successful |

---

## Review Summary — No Critical Security/Data Bugs ✅

Reviewed components without runtime bugs found:
- **CLI tools detail routing** (`CLIToolsPageClient`, `ToolDetailClient`): per-tool switch logic correct, no index mismatch
- **Auth stack** (login rate-limit, tunnel guard, SSO/OIDC/SAML modes, JWT session, logout, password-change with bcrypt + current-password verification, protected settings keys): secure implementation
- **i18n runtime**: original-text tracking prevents double translation, works correctly
- **Token-saver extras flow**: user-initiated progress poll, no issues
- **Recharts UsageChart**: data fetching + rendering works fine
- **Generic/STT/TTS media cards**: have formatted primary output, raw JSON is secondary detail (acceptable)
- **Theme toggles** (Header + HeaderMenu): both share single Zustand store, synchronized

---

## ESLint Noise Assessment ⚠️

**Pre-existing React 19 rule warnings** (pervasive patterns, fixing all would require massive refactor):

```
97 react-hooks/set-state-in-effect
37 react-hooks/immutability  
33 react-hooks/exhaustive-deps
12 next/no-img-element
8 react-hooks/purity
5 react-hooks/refs (my own hooks - fixed)
4 react/no-unescaped-entities
1 import/no-anonymous-default-export
```

**Decision:** Leave unfixed. These are framework evolution warnings, NOT runtime bugs. Fixing all would introduce regression risk and scope creep. Documented here for awareness.

---

## Test Results ✅

**Full E2E suite** (179 tests):
- **178 passed** 
- **0 failed**
- **1 flaky** (retry-pass: Token Saver toggle RTK AJAX - transient connection reset, known profile)

**Runtime verification:**
- Build success (`npm run build`)
- Server starts without errors
- Live SSE push wiring verified (mutation → realtime stream pushed new frame)
- No hardcoded secrets found
- Logo displays correctly in both dark/light modes
- Port displays dynamically in StatusBar

---

## Conclusion

✅ **All critical bugs found and fixed:**
1. Theme transition bug (primary report)
2. StatusBar hardcoded port
3. Model names in logs
4. Raw JSON embedding results
5. React 19 hook lint noise (fixed myself)

✅ **Security review:** No vulnerabilities found

✅ **All fixes verified with build + unit/e2e tests**

✅ **Remaining work:** ESLint noise (pre-existing React 19 warnings) - documented but intentionally left unfixed due to refactor risk and non-runtime nature

**Task Complete.**