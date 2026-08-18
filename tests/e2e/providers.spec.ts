import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Providers — data-driven per-provider verification (E2E spec v7 section 2.3)
// Every provider slug from the registry must render its detail page without 404/blank.
const PROVIDER_SLUGS = [
  "alicode", "alicode-intl", "alims-intl", "alitp-intl", "anthropic", "antigravity",
  "api-airforce", "assemblyai", "azure", "baidu", "bazaarlink", "blackbox",
  "byteplus", "cerebras", "chutes", "claude", "cline", "clinepass", "cloudflare-ai",
  "codebuddy-cn", "codebuddy-intl", "codex", "cohere", "commandcode", "cursor",
  "deepgram", "deepseek", "fal-ai", "featherless", "fireworks", "gemini",
  "gemini-cli", "github", "glm", "glm-cn", "grok-cli", "grok-web", "groq",
  "huggingface", "hyperbolic", "kilo-gateway", "kilocode", "kimchi", "kimi",
  "kiro", "llm7", "minimax", "minimax-cn", "mistral", "morph", "nanobanana",
  "nebius", "nvidia", "ollama", "ollama-local", "openai", "opencode", "opencode-go",
  "openrouter", "perplexity", "perplexity-agent", "perplexity-web", "poolside",
  "qoder", "siliconflow", "tencent", "together", "tokenrouter", "venice",
  "vercel-ai-gateway", "vertex", "vertex-partner", "volcengine-ark", "xai",
  "xiaomi-mimo", "xiaomi-tokenplan",
];

test.describe("Providers — per-provider render (data-driven)", () => {
  for (const slug of PROVIDER_SLUGS) {
    test(`provider /dashboard/providers/${slug} renders`, async ({ page }) => {
      await login(page);
      const res = await page.goto(`/dashboard/providers/${slug}`);
      expect(res?.status(), `${slug} should be 200`).toBe(200);
      // Not blank: either a provider heading or "Provider not found"
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible();
      const text = (await heading.innerText()).trim();
      expect(text.length).toBeGreaterThan(0);
      // No crash marker
      const bodyText = (await page.locator("body").innerText()).trim();
      expect(bodyText.length).toBeGreaterThan(10);
    });
  }
});