import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Media Providers — Embedding (E2E spec v7 section 2.9)
const KIND = "embedding";
const TITLE = "Embedding";

test.describe(`Media Providers — ${TITLE}`, () => {
  test("renders page", async ({ page }) => {
    await login(page);
    const res = await page.goto(`/dashboard/media-providers/${KIND}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    expect((await page.locator("body").innerText()).length).toBeGreaterThan(10);
  });

  test("sidebar media group expands to submenu", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /Media Providers/ }).click();
    await expect(page.getByRole("link", { name: new RegExp(TITLE) })).toBeVisible();
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("button", { name: /Media Providers/ }).click();
    await page.getByRole("link", { name: new RegExp(TITLE) }).click();
    await page.waitForURL(new RegExp(`/dashboard/media-providers/${KIND}`));
    expect(await page.evaluate(() => (window as any).__marker)).toBe(1);
  });
});