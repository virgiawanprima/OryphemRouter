// Sync model metadata from the ported provider registry into a static,
// normalized metadata file.
//
// WHY: the OmniRoute-ported registry (open-sse/providers/registry/*.js →
// PROVIDER_MODELS) carries rich per-model fields (contextLength,
// supportsVision, supportsReasoning, toolCalling, maxOutputTokens, kind, …)
// for 2700+ models. The curated MODEL_METADATA (metadata.js) only covers a
// subset. This script normalizes the registry fields into the metadata
// vocabulary (contextWindow, vision, reasoning, toolCalling, …) and writes a
// static GENERATED_METADATA file so callers get normalized metadata for every
// registered model without a runtime scan.
//
// USAGE: node open-sse/scripts/sync-model-metadata.mjs [--write]
//   (without --write it prints stats; with --write it regenerates the file)
//
// NOTE: generatedMetadata.js is derived data — re-run this script whenever the
// registry is re-ported/updated. Curated MODEL_METADATA still wins at lookup.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROVIDER_MODELS } from "../providers/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "providers", "models", "generatedMetadata.js");

function bool(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}

/** Normalize one registry model entry into the metadata vocabulary. */
function normalizeModel(pid, model) {
  if (typeof model === "string") {
    return { id: model, name: model };
  }
  const { id, name, ...rest } = model;
  const out = {
    id: String(id ?? ""),
    name: String(name ?? id ?? ""),
    provider: pid,
  };
  if (rest.contextLength !== undefined) out.contextWindow = Number(rest.contextLength) || null;
  if (rest.maxInputTokens !== undefined && out.contextWindow === undefined) {
    out.contextWindow = Number(rest.maxInputTokens) || null;
  }
  if (rest.supportsVision !== undefined) out.vision = bool(rest.supportsVision);
  if (rest.supportsReasoning !== undefined) out.reasoning = bool(rest.supportsReasoning);
  if (rest.toolCalling !== undefined) out.toolCalling = bool(rest.toolCalling);
  if (rest.maxOutputTokens !== undefined) out.maxOutputTokens = Number(rest.maxOutputTokens) || null;
  if (rest.kind !== undefined) out.kind = rest.kind;
  if (rest.upstreamModelId !== undefined) out.upstreamModelId = rest.upstreamModelId;
  if (rest.rateMultiplier !== undefined) out.rateMultiplier = Number(rest.rateMultiplier) || null;
  if (rest.targetFormat !== undefined) out.targetFormat = rest.targetFormat;
  return out;
}

// Build id → normalized entry. Prefer entries with the richest fields.
const byId = new Map();
for (const [pid, models] of Object.entries(PROVIDER_MODELS)) {
  for (const model of models || []) {
    const norm = normalizeModel(pid, model);
    if (!norm.id) continue;
    const existing = byId.get(norm.id);
    if (!existing) {
      byId.set(norm.id, norm);
      continue;
    }
    // Prefer the entry that declares more capability fields.
    const score = (o) => (o.contextWindow !== undefined ? 1 : 0) + (o.vision !== undefined ? 1 : 0) + (o.reasoning !== undefined ? 1 : 0) + (o.toolCalling !== undefined ? 1 : 0);
    if (score(norm) > score(existing)) byId.set(norm.id, norm);
  }
}

const entries = [...byId.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const withData = entries.filter(([, e]) => e.contextWindow !== undefined || e.vision !== undefined || e.reasoning !== undefined || e.toolCalling !== undefined);

if (process.argv.includes("--write")) {
  const lines = [
    "// GENERATED FILE — do not edit by hand.",
    "// Derived from the ported provider registry by:",
    "//   node open-sse/scripts/sync-model-metadata.mjs --write",
    "// Curated MODEL_METADATA (./metadata.js) always wins at lookup; this layer",
    "// supplies normalized metadata for the remaining registered models.",
    "export const GENERATED_METADATA = {",
  ];
  for (const [id, e] of entries) {
    const fields = [];
    for (const [k, v] of Object.entries(e)) {
      if (k === "id") continue;
      if (v === undefined) continue;
      fields.push(`    ${k}: ${JSON.stringify(v)},`);
    }
    lines.push(`  ${JSON.stringify(id)}: {`);
    lines.push(...fields);
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");
  writeFileSync(OUT, lines.join("\n"));
  console.log(`WROTE ${OUT}: ${entries.length} models (${withData.length} with normalized capability fields)`);
} else {
  console.log(`DRY-RUN: ${entries.length} models, ${withData.length} with normalized fields`);
  console.log("run with --write to regenerate open-sse/providers/models/generatedMetadata.js");
}
