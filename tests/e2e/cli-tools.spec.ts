import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// CLI Tools — per-tool verification (E2E spec v7 section 2.8)
// Detail routes exist for CLI_TOOLS keys; MITM tools live under MITM_TOOLS
// with dedicated pages wired elsewhere.
const TOOL_IDS = [
  "claude", "openclaw", "codex", "opencode", "cowork", "hermes", "droid",
  "cursor", "cline", "kilo", "roo", "continue", "amp", "qwen", "deepseek-tui",
  "jcode", "grok-build", "devin", "opendesign",
];

test.describe("CLI Tools — per-tool render (data-driven)", () => {
  for (const id of TOOL_IDS) {
    test(`tool /dashboard/cli-tools/${id} renders`, async ({ page }) => {
      await login(page);
      const res = await page.goto(`/dashboard/cli-tools/${id}`);
      expect(res?.status(), `${id} should be 200`).toBe(200);
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible();
      expect((await heading.innerText()).trim().length).toBeGreaterThan(0);
    });
  }
});