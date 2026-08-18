import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Branding + navigation — E2E spec v7 section 0 & 0c & 2.13/2.14
test.describe("Branding & navigation", () => {
  test("main nav items present", async ({ page }) => {
    await login(page);
    for (const label of [
      "Overview", "Endpoint & Key", "Providers", "Combo & Vision Adapter",
      "Usage", "Quota Tracker", "Token Saver", "CLI Tools",
    ]) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test("system nav has Remote (no 9 prefix)", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Remote", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("English", { exact: true }).first()).toHaveCount(0);
  });

  test("no '9' branding remnants in sidebar", async ({ page }) => {
    await login(page);
    await page.waitForSelector('aside');
    const sidebar = page.locator('aside').first();
    const text = (await sidebar.innerText()) || '';
    expect(text).not.toContain('9Remote');
    expect(text).not.toContain('9English');
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    // Seed a sentinel on window; a full reload would wipe it.
    await page.evaluate(() => { (window as any).__spaMarker = 1; });
    await page.getByRole('link', { name: /Providers/ }).first().click();
    await page.waitForURL(/\/dashboard\/providers/);
    await page.getByRole('link', { name: /Overview/ }).first().click();
    await page.waitForURL(/\/dashboard$/);
    const marker = await page.evaluate(() => (window as any).__spaMarker);
    expect(marker).toBe(1);
  });

  test("title contains product name", async ({ page }) => {
    await login(page);
    expect(await page.title()).toContain("OryphemRouter");
  });

  test("favicon resolves 200", async ({ page }) => {
    const res = await page.request.get("/favicon.svg");
    expect(res.status()).toBe(200);
  });

  test("logo assets resolve 200", async ({ page }) => {
    for (const img of ["putih", "biru", "hitam"]) {
      const res = await page.request.get(`/images/logo-oryphem-${img}.png`);
      expect(res.status(), `logo-${img}`).toBe(200);
    }
  });
});
