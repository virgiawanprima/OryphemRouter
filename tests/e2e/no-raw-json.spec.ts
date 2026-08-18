import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// No raw JSON as default output — E2E spec v7 section 0e
const PAGES = [
  "/dashboard",
  "/dashboard/providers",
  "/dashboard/combos",
  "/dashboard/usage",
  "/dashboard/quota",
  "/dashboard/cli-tools",
  "/dashboard/proxy-pools",
  "/dashboard/skills",
  "/dashboard/console-log",
  "/dashboard/token-saver",
  "/dashboard/endpoint",
  "/dashboard/media-providers/embedding",
  "/dashboard/media-providers/image",
  "/dashboard/media-providers/tts",
  "/dashboard/media-providers/stt",
  "/dashboard/media-providers/video",
  "/dashboard/media-providers/web",
];

test.describe("No raw JSON in UI", () => {
  for (const path of PAGES) {
    test(`${path} has no raw JSON pre-block`, async ({ page }) => {
      await login(page);
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      // JSON blobs shown as default usually live in <pre> outside allowed contexts.
      // Allowed contexts (CLI config snippets) are code blocks with dracula highlight.
      const preText = await page.locator("pre").allInnerTexts();
      for (const t of preText) {
        // Heuristic: raw JSON starts with { or [ and has multiple quoted keys
        const looksJson = /^[{\[]/.test(t.trim()) && /"[a-zA-Z_-]+"\s*:/.test(t);
        // CLI config snippets are allowed — they live in pages whose url contains cli-tools
        expect(looksJson && !path.includes("cli-tools"), `raw JSON on ${path}`).toBeFalsy();
      }
    });
  }
});
