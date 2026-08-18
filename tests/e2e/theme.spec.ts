import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Dracula theme — E2E spec v7 section 0b
test.describe("Dracula theme", () => {
  test("CSS tokens match Dracula palette", async ({ page }) => {
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
    expect(tokens.bg).toBe("#282a36");
    expect(tokens.text).toBe("#f8f8f2");
    expect(tokens.border).toBe("#44475a");
    expect(tokens.primary.toLowerCase()).toBe("#bd93f9");
  });

  test("body uses Dracula background", async ({ page }) => {
    await login(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(40, 42, 54)");
  });

  test("toggle switches theme visibly and persists across reload", async ({ page }) => {
    await login(page);
    const toggle = page.getByRole("button", { name: /Switch to/i }).first();
    await expect(toggle).toBeVisible();

    const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // Default is dark
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);

    // Switch to light → background and surface vars flip
    await toggle.click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    expect(await bodyBg()).toBe("rgb(250, 249, 252)");

    // Persists after full reload
    await page.reload();
    await page.waitForSelector("aside");
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    expect(await bodyBg()).toBe("rgb(250, 249, 252)");

    // Toggle back to dark
    await page.getByRole("button", { name: /Switch to/i }).first().click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    expect(await bodyBg()).toBe("rgb(40, 42, 54)");
  });

  test("color transitions are applied for smooth theme change", async ({ page }) => {
    await login(page);
    const dur = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
    expect(dur).not.toBe("0s");
  });
});
