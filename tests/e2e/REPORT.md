# OryphemRouter Dashboard — E2E Test Report (v7 spec)

Run: Playwright chromium vs production build (`node .next/standalone/custom-server.js`), base URL `http://localhost:3000`.
Result: **177 passed, 0 failed, 0 flaky** (retries: none triggered). Evidence: `playwright-report/`, `/tmp/pw-prod.log`.

## Per-category pass/fail

| Category | File | Tests | Pass | Fail |
|---|---|---|---|---|
| Overview (0d) | `tests/e2e/overview.spec.ts` | 6 | 6 | 0 |
| Endpoint & Key (2.2) | `tests/e2e/endpoint-key.spec.ts` | 3 | 3 | 0 |
| Providers (2.3, per-provider data-driven) | `tests/e2e/providers.spec.ts` | 76 | 76 | 0 |
| Combo & Vision Adapter (2.4) | `tests/e2e/combo-vision.spec.ts` | 2 | 2 | 0 |
| Usage (2.5) | `tests/e2e/usage.spec.ts` | 3 | 3 | 0 |
| Quota Tracker (2.6) | `tests/e2e/quota-tracker.spec.ts` | 3 | 3 | 0 |
| Token Saver (2.7) | `tests/e2e/token-saver.spec.ts` | 3 | 3 | 0 |
| CLI Tools (2.8, per-tool data-driven) | `tests/e2e/cli-tools.spec.ts` | 19 | 19 | 0 |
| Media — Embedding (2.9) | `tests/e2e/media-embedding.spec.ts` | 3 | 3 | 0 |
| Media — Text to Image (2.9) | `tests/e2e/media-text-to-image.spec.ts` | 3 | 3 | 0 |
| Media — TTS (2.9) | `tests/e2e/media-tts.spec.ts` | 3 | 3 | 0 |
| Media — STT (2.9) | `tests/e2e/media-stt.spec.ts` | 3 | 3 | 0 |
| Media — Video (2.9) | `tests/e2e/media-video.spec.ts` | 3 | 3 | 0 |
| Media — Web Fetch & Search (2.9) | `tests/e2e/media-web-fetch-search.spec.ts` | 3 | 3 | 0 |
| Proxy Pools (2.10) | `tests/e2e/proxy-pools.spec.ts` | 3 | 3 | 0 |
| Skills (2.11) | `tests/e2e/skills.spec.ts` | 2 | 2 | 0 |
| Console Log (2.12) | `tests/e2e/console-log.spec.ts` | 3 | 3 | 0 |
| Remote (2.13) | `tests/e2e/remote.spec.ts` | 2 | 2 | 0 |
| Settings (2.15) | `tests/e2e/settings.spec.ts` | 8 | 8 | 0 |
| Branding & nav (0, 0c) | `tests/e2e/branding.spec.ts` | 7 | 7 | 0 |
| Theme Dracula (0b) | `tests/e2e/theme.spec.ts` | 2 | 2 | 0 |
| No raw JSON (0e) | `tests/e2e/no-raw-json.spec.ts` | 17 | 17 | 0 |
| **Total** | | **177** | **177** | **0** |

## Real-time verification (spec §3)
- SSE (`/api/dashboard/realtime` via `useRealtime`): Overview, Console Log (`/api/translator/console-logs/stream`), Usage (`/api/usage/stream`) — asserted streams open in tests.
- AJAX/polling: Proxy Pools (`/api/proxy-pools`), Quota refresh, Token Saver toggles, Endpoint copy — asserted requests without full page reload.
- SPA navigation proven on every page group via `window` marker surviving client-side `next/link` navigation.

## Theme & branding verification
- Dracula tokens asserted: bg `#282a36`, fg `#f8f8f2`, border `#44475a`, primary `#bd93f9`; body background `rgb(40,42,54)`.
- `9Remote` / `9English` remain absent from sidebar; labels render as "Remote" and "English" (grep: 0 hits in `src/`).
- Title, favicon (200), and three logo variants (putih/biru/hitam, 200s) verified.

## Raw JSON (0e)
- 17 dashboard/media pages scanned: no raw JSON `<pre>` outside allowed contexts (CLI config snippets).

## Notes
- Dev (webpack) server in this VM flakes under load (login 500s, dev-mode React warnings); the green run is on the production standalone build. `playwright.config.ts` uses `retries: 1`, `workers: 1`, `expect.timeout: 15000`, `navigationTimeout: 45000`.
- Pre-existing unit-test failures (untouched by this work, unrelated to E2E scope): `tests/unit/antigravity-oauth-client.test.js` (3), plus 2 suites that cannot resolve missing deps/dirs (`lowdb` package, `cloud/` dir). E2E suite is independent of these.