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
    // No model is declared for other formats on the zen registry (dynamic passthrough
    // catalog), so the chat endpoint is the default for arbitrary ids.
    expect(executor.buildUrl("kimi-k2.6")).toBe(`${base}/zen/v1/chat/completions`);
    expect(executor.buildUrl("some-future-model")).toBe(`${base}/zen/v1/chat/completions`);
  });

  // KNOWN GAP (docs verified 2026-09-16, not fixed here):
  // opencode.ai/docs/zen publishes a per-model endpoint table and only part of the catalog
  // speaks chat — all GPT models need /zen/v1/responses, all Claude models plus Qwen need
  // /zen/v1/messages, and the Gemini models use a PER-MODEL path (/zen/v1/models/<model-id>).
  // The zen registry declares no models and no transports, so those models are routed to
  // /chat/completions today and cannot work. Closing it needs (a) a zen model catalog with
  // per-model supportedFormats and (b) a transport shape that can express a per-model path
  // template, which the current `transports[] {format, baseUrl}` cannot. See
  // Projek/oryphemrouter in the vault.
  it("documents the gap: no per-model zen formats are declared yet", () => {
    expect(PROVIDERS.opencode.transports).toBeUndefined();
    expect(PROVIDERS.opencode.models ?? []).toEqual([]);
  });
});
