import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Console Log — E2E spec v7 section 2.12. Live via SSE stream.
test.describe("Console Log", () => {
  test("renders console log page", async ({ page }) => {
    await login(page);
    const res = await page.goto("/dashboard/console-log");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Console Log", { exact: true }).first()).toBeVisible();
  });

  test("opens SSE stream for live logs", async ({ page }) => {
    let sseSeen = false;
    page.on("request", (req) => {
      if (req.url().includes("/console-logs/stream")) sseSeen = true;
    });
    await login(page);
    await page.goto("/dashboard/console-log");
    await page.waitForTimeout(5000);
    expect(sseSeen, "console log should open SSE stream").toBe(true);
  });

  test("SPA navigation without full reload", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { (window as any).__marker = 1; });
    await page.getByRole("link", { name: /Console Log/ }).first().click();
    await page.waitForURL(/\/dashboard\/console-log/);
    expect(await page.evaluate(() => (window as any).__marker)).toBe(1);
  });
});