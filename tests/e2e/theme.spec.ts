import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Material Design 3 theme — E2E spec (M3 seed #6750A4)
test.describe("Material 3 theme", () => {
  test("CSS tokens match M3 palette (dark)", async ({ page }) => {
    await login(page);
    await page.waitForSelector('aside');
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        bg: cs.getPropertyValue('--color-bg').trim(),
        text: cs.getPropertyValue('--color-text').trim(),
        border: cs.getPropertyValue('--color-border').trim(),
        primary: cs.getPropertyValue('--color-primary').trim(),
      };
    });
    // M3 dark scheme harmonized to deep indigo (WCAG AA) — matches committed tokens
    expect(tokens.bg.toLowerCase()).toBe("#131318");
    expect(tokens.text.toLowerCase()).toBe("#e4e1e9");
    expect(tokens.border.toLowerCase()).toBe("#46464f");
    expect(tokens.primary.toLowerCase()).toBe("#bcc2ff");
  });

  test("body uses M3 dark background", async ({ page }) => {
    await login(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(19, 19, 24)");
  });

  test("toggle switches theme visibly and persists across reload", async ({ page }) => {
    await login(page);
    const toggle = page.getByRole("button", { name: /Switch to/i }).first();
    await expect(toggle).toBeVisible();

    const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // Default is dark
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    expect(await bodyBg()).toBe("rgb(19, 19, 24)");

    // Switch to light → M3 light background
    await toggle.click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    expect(await bodyBg()).toBe("rgb(251, 248, 255)");

    // Persists after full reload
    await page.reload();
    await page.waitForSelector("aside");
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    expect(await bodyBg()).toBe("rgb(251, 248, 255)");

    // Toggle back to dark
    await page.getByRole("button", { name: /Switch to/i }).first().click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    expect(await bodyBg()).toBe("rgb(19, 19, 24)");
  });

  test("color transitions are applied for smooth theme change", async ({ page }) => {
    await login(page);
    const dur = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
    expect(dur).not.toBe("0s");
  });
});
