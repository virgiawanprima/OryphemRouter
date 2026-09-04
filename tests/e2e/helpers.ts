import { Page } from "@playwright/test";

// Shared helpers for E2E tests. Login once via API, seed storage state.

export const DASHBOARD_URL = "/dashboard";

export async function login(page: Page, password = "123") {
  // Retry transient server errors (ECONNRESET / 5xx) during test load.
  let res: Awaited<ReturnType<typeof page.request.post>> | null = null;
  for (let i = 0; i < 4; i++) {
    try {
      res = await page.request.post("/api/auth/login", { data: { password } });
      if (res.ok()) break;
    } catch {
      // Network-level failure (ECONNRESET, socket hang up) — retry below.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!res || !res.ok()) throw new Error(`login failed: ${res ? res.status() : "network error"}`);
  await page.goto(DASHBOARD_URL);
  // Dashboard keeps an SSE stream open — networkidle never settles, so wait for shell instead.
  await page.waitForSelector("aside", { timeout: 15000 });
  // Let the Next.js runtime hydrate so sidebar <Link> clicks use client-side routing
  // instead of falling back to a full document navigation.
  await page.waitForTimeout(2000);
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}
