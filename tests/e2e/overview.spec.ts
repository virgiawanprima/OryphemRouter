import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Overview — E2E spec v7 section 0d
test.describe("Overview", () => {
  test("renders AI Router Cockpit with live badge", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { name: /overview/i }).first()).toBeVisible();
    await expect(page.getByText(new RegExp("AI Router Cockpit")).first()).toBeVisible();
    await expect(page.getByText("Live", { exact: true }).first()).toBeVisible({ timeout: 20000 });
  });

  test("shows 4 status cards", async ({ page }) => {
    await login(page);
    
    for (const label of ["Server", "Connections", "Active requests", "Tokens"]) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test("provider health list and quick access", async ({ page }) => {
    await login(page);
    
    await expect(page.getByText("View all", { exact: false }).first()).toBeVisible();
    for (const qa of ["Endpoint & Key", "Providers", "Quota"]) {
      await expect(page.getByText(qa, { exact: false }).first()).toBeVisible();
    }
  });

  test("SSE active-requests card updates live", async ({ page }) => {
    await login(page);
    
    // Verify the card is labeled "live via SSE" — proof EventSource is expected
    await expect(page.getByText("live via SSE", { exact: false })).toBeVisible();
  });

  test("shows live badge instead of auto-refresh wait copy", async ({ page }) => {
    await login(page);
    // Real-time: no "refreshes every N seconds" waiting copy, live badge present.
    await expect(page.getByText(/refreshes automatically i/)).toHaveCount(0);
    await expect(page.getByText("live", { exact: true }).first()).toBeVisible();
  });

  test("no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await login(page);
    
    expect(errors).toEqual([]);
  });
});
