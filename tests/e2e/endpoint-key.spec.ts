import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Endpoint & Key — E2E spec v7 section 2.2
test.describe("Endpoint & Key", () => {
  test("renders endpoint page with API key section", async ({ page }) => {
    await login(page);
    const res = await page.goto("/dashboard/endpoint");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Endpoint & Key", { exact: true }).first()).toBeVisible();
  });

  test("endpoint URL and API key are displayed and copyable", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page);
    await page.goto("/dashboard/endpoint");
    await page.waitForTimeout(1500);
    const copyBtn = page.getByRole("button", { name: /Copy/i }).first();
    await expect(copyBtn).toBeVisible({ timeout: 20000 });
    await copyBtn.click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.length).toBeGreaterThan(0);
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("link", { name: /Endpoint & Key/ }).first().click();
    await page.waitForURL(/\/dashboard\/endpoint/);
    const marker = await page.evaluate(() => (window as any).__marker);
    expect(marker).toBe(1);
  });
});