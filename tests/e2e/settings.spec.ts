import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Settings — E2E spec v7 section 2.15. Toggles/AJAX coexist with dashboard tabs.
test.describe("Settings & system pages", () => {
  const PAGES = [
    { path: "/dashboard/endpoint", label: "Endpoint" },
    { path: "/dashboard/quota", label: "Quota" },
    { path: "/dashboard/token-saver", label: "Token saver" },
    { path: "/dashboard/console-log", label: "Console log" },
    { path: "/dashboard/proxy-pools", label: "Proxy pools" },
    { path: "/dashboard/skills", label: "Skills" },
    { path: "/dashboard/profile", label: "Settings" },
  ];

  for (const { path, label } of PAGES) {
    test(`${path} renders without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await login(page);
      const res = await page.goto(path);
      expect(res?.status(), `${path} should be 200`).toBe(200);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
      await expect(page.locator("body").innerText().then((t) => t.length)).resolves.toBeGreaterThan(10);
      expect(errors.filter((e) => !e.includes("favicon") && !e.includes("Analytics"))).toEqual([]);
    });
  }

  test("sidebar has Remote (renamed from 9Remote), no English link", async ({ page }) => {
    await login(page);
    const sidebar = await page.locator("aside").first().innerText();
    expect(sidebar).toContain("Remote");
    expect(sidebar).not.toContain("English");
    expect(sidebar).not.toContain("9Remote");
    expect(sidebar).not.toContain("9English");
  });
});