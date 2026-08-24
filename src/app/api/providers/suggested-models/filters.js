// Free OpenCode models that don't use the "-free" id suffix
const KNOWN_FREE_OPENCODE_MODELS = ["big-pickle"];

import { deriveModelName } from "open-sse/providers/models/namePatterns.js";

export const FILTERS = {
  "openrouter-free": (models) =>
    models
      .filter(
        (m) =>
          m.pricing?.prompt === "0" &&
          m.pricing?.completion === "0" &&
          m.context_length >= 200000
      )
      .map((m) => ({ id: m.id, name: m.name, contextLength: m.context_length }))
      .sort((a, b) => b.contextLength - a.contextLength),

  "opencode-free": (models) =>
    models
      .filter((m) => m.id?.endsWith("-free") || KNOWN_FREE_OPENCODE_MODELS.includes(m.id))
      // Derive an honest display name from the id (e.g. "deepseek-v4-flash-free"
      // → "DeepSeek V4 Flash Free") instead of showing the raw id.
      .map((m) => ({ id: m.id, name: deriveModelName(m.id) })),
};
