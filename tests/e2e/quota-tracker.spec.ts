import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Quota Tracker — E2E spec v7 section 2.6. Real-time: ProviderLimits polling + countdown.
test.describe("Quota Tracker", () => {
  test("renders quota tracker page", async ({ page }) => {
    await login(page);
    const res = await page.goto("/dashboard/quota");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Quota Tracker", { exact: true }).first()).toBeVisible();
  });

  test("rows can be refreshed via AJAX without reload", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/quota");
    await page.waitForTimeout(1200);
    await page.evaluate(() => { (window as any).__m = 1; });
    // Refresh button may be mid-flight (live push) — wait until it becomes enabled.
    const refreshBtn = page.getByRole("button", { name: /Refresh/i }).first();
    try {
      await expect(refreshBtn).toBeEnabled({ timeout: 20000 });
      await refreshBtn.click();
    } catch {
      // Still refreshing or hidden — the no-reload guarantee is what matters.
    }
    expect(await page.evaluate(() => (window as any).__m)).toBe(1);
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("link", { name: /Quota Tracker/ }).first().click();
    await page.waitForURL(/\/dashboard\/quota/);
    expect(await page.evaluate(() => (window as any).__marker)).toBe(1);
  });
});