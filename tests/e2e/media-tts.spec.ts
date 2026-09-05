import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Media Providers — Text To Speech (E2E spec v7 section 2.9)
const KIND = "tts";
const TITLE = "Text To Speech";

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
    await page.getByRole("menuitem", { name: /Media Providers/ }).first().click();
    await expect(page.getByRole("link", { name: new RegExp(TITLE) }).first()).toBeVisible();
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("menuitem", { name: /Media Providers/ }).first().click();
    await page.getByRole("link", { name: new RegExp(TITLE) }).first().click();
    await page.waitForURL(new RegExp(`/dashboard/media-providers/${KIND}`));
    expect(await page.evaluate(() => (window as any).__marker)).toBe(1);
  });
});