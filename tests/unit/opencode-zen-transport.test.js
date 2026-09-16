/**
 * Zen (opencode) transport resolution.
 *
 * The executor used to carry `const MESSAGES_MODELS = new Set()` and branch on it:
 * an allowlist that could only ever go stale, and an empty one silently pinned every
 * model to /chat/completions. Transport is now read from the registry declaration
 * (`transports[]` + per-model `supportedFormats`), the same mechanism opencode-go
 * uses — see the 9Router transport lesson in Projek/oryphemrouter.
 *
 * Offline: pure static assertions, no network.
 */

import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { OpenCodeExecutor } from "../../open-sse/executors/opencode.js";

describe("OpenCode zen transport — resolved from metadata, not a hardcoded id list", () => {
  it("routes to chat when the registry declares no per-model formats", () => {
    const executor = new OpenCodeExecutor();
    const base = PROVIDERS.opencode.baseUrl;
    // No model is declared for /messages on the zen registry (dynamic passthrough
    // catalog), so the chat endpoint stays the default for arbitrary ids.
    expect(executor.buildUrl("kimi-k2.6")).toBe(`${base}/zen/v1/chat/completions`);
    expect(executor.buildUrl("some-future-model")).toBe(`${base}/zen/v1/chat/completions`);
  });
});
