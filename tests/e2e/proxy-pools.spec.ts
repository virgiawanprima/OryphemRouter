import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Proxy Pools — E2E spec v7 section 2.10. Live via polling AJAX.
test.describe("Proxy Pools", () => {
  test("renders proxy pools page", async ({ page }) => {
    await login(page);
    const res = await page.goto("/dashboard/proxy-pools");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Add Proxy Pool").first()).toBeVisible();
  });

  test("polls status via AJAX without reload", async ({ page }) => {
    let polls = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/proxy-pools")) polls += 1;
    });
    await login(page);
    await page.goto("/dashboard/proxy-pools");
    await page.waitForTimeout(4000);
    expect(polls, "proxy pools page should poll its API").toBeGreaterThan(0);
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("link", { name: /Proxy Pools/ }).first().click();
    await page.waitForURL(/\/dashboard\/proxy-pools/);
    expect(await page.evaluate(() => (window as any).__marker)).toBe(1);
  });
});