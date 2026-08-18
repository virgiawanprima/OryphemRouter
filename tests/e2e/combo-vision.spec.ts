import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Combo & Vision Adapter — E2E spec v7 section 2.4
test.describe("Combo & Vision Adapter", () => {
  test("renders combos page", async ({ page }) => {
    await login(page);
    const res = await page.goto("/dashboard/combos");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Create Combo").first()).toBeVisible();
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("link", { name: /Combo & Vision Adapter/ }).first().click();
    await page.waitForURL(/\/dashboard\/combos/);
    const marker = await page.evaluate(() => (window as any).__marker);
    expect(marker).toBe(1);
  });
});