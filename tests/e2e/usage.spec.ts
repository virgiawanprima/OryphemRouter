import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Usage — E2E spec v7 section 2.5. Real-time: SSE stream from /api/usage/stream.
test.describe("Usage", () => {
  test("renders usage page", async ({ page }) => {
    await login(page);
    const res = await page.goto("/dashboard/usage");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    expect((await page.locator("body").innerText()).length).toBeGreaterThan(10);
  });

  test("opens SSE stream for live usage", async ({ page }) => {
    let sseSeen = false;
    page.on("request", (req) => {
      if (req.url().includes("/api/usage/stream")) sseSeen = true;
    });
    await login(page);
    await page.goto("/dashboard/usage");
    await page.waitForTimeout(5000);
    expect(sseSeen, "usage page should open SSE stream").toBe(true);
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("link", { name: /Usage/ }).first().click();
    await page.waitForURL(/\/dashboard\/usage/);
    expect(await page.evaluate(() => (window as any).__marker)).toBe(1);
  });
});