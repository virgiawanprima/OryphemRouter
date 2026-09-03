/**
 * Explicit translator bootstrap module.
 * Importing this file initializes all translator adapters via side-effect registration.
 *
 * ADAPTED for OryphemRouter: the following source modules are not ported in this
 * project and their side-effect imports are omitted:
 *   - ./request/claude-to-gemini.ts
 *   - ./response/gemini-to-claude.ts
 *   - ./response/openai-to-gemini.ts
 */

import "./request/claude-to-openai.js";
import "./request/openai-to-claude.js";
import "./request/gemini-to-openai.js";
import "./request/openai-to-gemini.js";
import "./request/antigravity-to-openai.js";
import "./request/openai-responses.js";
import "./request/openai-to-kiro.js";
import "./request/openai-to-cursor.js";

import "./response/claude-to-openai.js";
import "./response/openai-to-claude.js";
import "./response/gemini-to-openai.js";
import "./response/openai-to-antigravity.js";
import "./response/openai-responses.js";
import "./response/kiro-to-openai.js";
import "./response/cursor-to-openai.js";

export function bootstrapTranslatorRegistry() {
  // no-op by design; importing this module triggers translator self-registration once
}
