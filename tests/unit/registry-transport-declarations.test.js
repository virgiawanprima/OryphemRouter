/**
 * Registry-wide invariant: a transport declaration must be reachable.
 *
 * The opencode-go and zen bugs both had the same shape — a model routed to an endpoint the
 * provider does not serve. Both were fixed per-provider; this test generalises the one part
 * that CAN be checked statically across the whole registry: if a model declares
 * `supportedFormats`, every format it names must exist as a `transports[]` entry on its own
 * provider. A declaration without a transport is a route that cannot be taken.
 *
 * It cannot verify the converse (that a provider's every declared transport is valid for
 * every model) — that needs each vendor's per-model docs, which is how the per-provider
 * catalog work was done.
 */

import { describe, it, expect } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";

const PROVIDERS_WITH_TRANSPORTS = REGISTRY.filter((e) => Array.isArray(e.transports));

describe("registry transport declarations", () => {
  it("has a non-empty fixture on both sides", () => {
    expect(PROVIDERS_WITH_TRANSPORTS.length).toBeGreaterThan(0);
    expect(REGISTRY.some((e) => (e.models || []).some((m) => typeof m !== "string" && m.supportedFormats))).toBe(true);
  });

  it("every declared model format is backed by a transport on that provider", () => {
    const offenders = [];
    for (const entry of REGISTRY) {
      const available = new Set((entry.transports || []).map((t) => t.format));
      for (const model of entry.models || []) {
        if (typeof model === "string" || !model.supportedFormats) continue;
        const missing = model.supportedFormats.filter((f) => !available.has(f));
        if (missing.length > 0) {
          offenders.push(`${entry.id}:${model.id} declares [${missing.join(", ")}] but the provider offers [${[...available].join(", ")}]`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no model declares formats for a provider that declares no transports", () => {
    const offenders = [];
    for (const entry of REGISTRY) {
      if (entry.transports) continue;
      for (const model of entry.models || []) {
        if (typeof model === "string" || !model.supportedFormats) continue;
        offenders.push(`${entry.id}:${model.id} -> [${model.supportedFormats.join(", ")}]`);
      }
    }
    // Declaring formats on a provider with no transports[] is dead metadata: chatCore would
    // look for a transport that cannot exist.
    expect(offenders).toEqual([]);
  });
});
