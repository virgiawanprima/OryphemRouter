import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Remote — E2E spec v7 section 2.13. Label is "Remote" (renamed from 9Remote).
test.describe("Remote", () => {
  test("sidebar shows Remote (no 9 prefix)", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Remote", { exact: true }).first()).toBeVisible();
  });

  test("clicking Remote opens promo modal", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /Remote/i }).first().click();
    await expect(page.getByRole("heading", { name: /Remote/i }).last()).toBeVisible();
  });
});