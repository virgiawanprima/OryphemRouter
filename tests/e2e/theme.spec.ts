import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Tokyo Night theme — E2E spec
test.describe("Tokyo Night theme", () => {
  test("CSS tokens match Tokyo Night palette (dark)", async ({ page }) => {
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
    // Tokyo Night dark scheme — matches committed tokens
    expect(tokens.bg.toLowerCase()).toBe("#1a1b26");
    expect(tokens.text.toLowerCase()).toBe("#c0caf5");
    expect(tokens.border.toLowerCase()).toBe("#292e42");
    expect(tokens.primary.toLowerCase()).toBe("#7aa2f7");
  });

  test("body uses Tokyo Night dark background", async ({ page }) => {
    await login(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(26, 27, 38)");
  });

  test("toggle switches theme visibly and persists across reload", async ({ page }) => {
    await login(page);
    const toggle = page.getByRole("button", { name: /Switch to/i }).first();
    await expect(toggle).toBeVisible();

    const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // Default is dark
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    expect(await bodyBg()).toBe("rgb(26, 27, 38)");

    // Switch to light → Tokyo Night Day background
    await toggle.click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    expect(await bodyBg()).toBe("rgb(225, 226, 231)");

    // Persists after full reload
    await page.reload();
    await page.waitForSelector("aside");
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    expect(await bodyBg()).toBe("rgb(225, 226, 231)");

    // Toggle back to dark
    await page.getByRole("button", { name: /Switch to/i }).first().click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    expect(await bodyBg()).toBe("rgb(26, 27, 38)");
  });

  test("color transitions are applied for smooth theme change", async ({ page }) => {
    await login(page);
    const dur = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
    expect(dur).not.toBe("0s");
  });
});
