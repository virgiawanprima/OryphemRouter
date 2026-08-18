import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Skills — E2E spec v7 section 2.11. AJAX toggle, persisted server-side.
test.describe("Skills", () => {
  test("renders skills page with skill list", async ({ page }) => {
    await login(page);
    const res = await page.goto("/dashboard/skills");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("START HERE").first()).toBeVisible();
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("link", { name: /Skills/ }).first().click();
    await page.waitForURL(/\/dashboard\/skills/);
    expect(await page.evaluate(() => (window as any).__marker)).toBe(1);
  });
});