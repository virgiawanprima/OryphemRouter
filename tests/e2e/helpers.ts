import { Page } from "@playwright/test";

// Shared helpers for E2E tests. Login once via API, seed storage state.

export const DASHBOARD_URL = "/dashboard";

export async function login(page: Page, password = "123") {
  // Retry transient server errors during parallel test load.
  let res = await page.request.post("/api/auth/login", { data: { password } });
  for (let i = 0; !res.ok() && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await page.request.post("/api/auth/login", { data: { password } });
  }
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
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
