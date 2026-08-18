import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Token Saver — E2E spec v7 section 2.7. Toggles persist via AJAX (patchSetting).
test.describe("Token Saver", () => {
  test("renders token saver page with feature toggles", async ({ page }) => {
    await login(page);
    const res = await page.goto("/dashboard/token-saver");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Token Saver", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Rtk").first()).toBeVisible();
  });

  test("toggle RTK via AJAX without reload", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/token-saver");
    const rtk = page.getByRole("checkbox").first();
    if (await rtk.count()) {
      await page.evaluate(() => { (window as any).__m = 1; });
      await rtk.click();
      expect(await page.evaluate(() => (window as any).__m)).toBe(1);
    }
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("link", { name: /Token Saver/ }).first().click();
    await page.waitForURL(/\/dashboard\/token-saver/);
    expect(await page.evaluate(() => (window as any).__marker)).toBe(1);
  });
});