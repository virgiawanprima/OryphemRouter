import { createCompressionStats } from "../stats.js";
import {
  buildOmniGlyphAccounting
} from "../omniglyphTelemetry.js";
import {
  isOmniGlyphSupportedModelForScope,
  mergeCompressionProfileOptions,
  resolveCompressionProfile,
  transformAnthropicMessages,
  transformOpenAIChatCompletions,
  transformOpenAIResponses
} from "../../../utils/omni/omniglyphShim.js";
import { isModelImageable } from "../../../utils/omni/omniglyphShim.js";
const MEASURED_MODEL_SCOPE = "coding-safe";
const DEFAULT_PROFILE = "aggressive";
function resolveProfileName(options) {
  const step = options?.stepConfig?.profile;
  if (typeof step === "string" && step.trim()) return step;
  const global = options?.config?.omniglyph?.profile;
  if (typeof global === "string" && global.trim()) return global;
  return DEFAULT_PROFILE;
}
function isModelWithinScope(model, scope) {
  if (!isOmniGlyphSupportedModelForScope(model, MEASURED_MODEL_SCOPE)) return false;
  return isOmniGlyphSupportedModelForScope(model, scope);
}
function skip(body, reason) {
  try {
    return {
      body,
      compressed: false,
      stats: createCompressionStats(body, body, "stacked", [`skip:${reason}`])
    };
  } catch {
    return { body, compressed: false, stats: null };
  }
}
function isClaudeFormat(body) {
  const messages = body.messages;
  if (!Array.isArray(messages)) return false;
  return !messages.some((m) => m?.role === "system");
}
function inferWireFormat(body) {
  if (Array.isArray(body.input) || typeof body.instructions === "string") {
    return "openai-responses";
  }
  if (!isClaudeFormat(body)) return "openai";
  return "claude";
}
function resolveWireFormat(body, options) {
  const stage = options?.compressionStage ?? "pre-translation";
  const requested = stage === "post-translation" ? options?.targetFormat : options?.sourceFormat;
  if (requested === "claude" || requested === "openai" || requested === "openai-responses") {
    return requested;
  }
  if (requested) return null;
  return inferWireFormat(body);
}
async function applyOmniglyph(body, options) {
  const model = options?.model ?? body.model ?? "";
  if (options?.supportsVision !== true) return skip(body, "no_vision");
  if (options?.providerTransport !== "direct") return skip(body, "transport_not_direct");
  if (options?.imageTransportFidelity !== void 0 && options.imageTransportFidelity !== "byte-preserving") {
    return skip(
      body,
      options.imageTransportFidelity === "resizes" ? "transport_resizes_images" : "transport_fidelity_unknown"
    );
  }
  const stage = options?.compressionStage ?? "pre-translation";
  const wireFormat = resolveWireFormat(body, options);
  const sourceWireFormat = options?.sourceFormat ?? wireFormat;
  if (stage === "pre-translation" && options?.targetFormat && sourceWireFormat && options.targetFormat !== sourceWireFormat) {
    return skip(body, "requires_post_translation");
  }
  if (stage === "pre-translation" && wireFormat !== "claude") {
    return skip(body, "requires_post_translation");
  }
  if (!wireFormat) return skip(body, "target_format_not_supported");
  if (wireFormat === "claude" && !isClaudeFormat(body)) {
    return skip(body, "source_format_not_claude");
  }
  if (wireFormat === "openai" && !Array.isArray(body.messages)) {
    return skip(body, "source_format_not_openai");
  }
  if (wireFormat === "openai-responses" && !Array.isArray(body.input) && typeof body.input !== "string") {
    return skip(body, "source_format_not_openai_responses");
  }
  let profile;
  try {
    profile = resolveCompressionProfile(resolveProfileName(options));
  } catch {
    return skip(body, "invalid_profile");
  }
  if (profile.name === "passthrough") return skip(body, "profile_passthrough");
  if (!isModelWithinScope(model, profile.name)) {
    return skip(body, "model_not_approved");
  }
  const preserveSystemPrompt = (typeof options?.stepConfig?.preserveSystemPrompt === "boolean" ? options.stepConfig.preserveSystemPrompt : options?.config?.preserveSystemPrompt) === true;
  if (preserveSystemPrompt && wireFormat !== "claude") {
    return skip(body, "system_preservation_unsupported_on_wire");
  }
  if (!isModelImageable(model)) return skip(body, "model_not_imageable");
  const started = Date.now();
  let outBody;
  let accounting;
  try {
    const transformBody = wireFormat !== "claude" && model && body.model !== model ? { ...body, model } : body;
    const encoded = new TextEncoder().encode(JSON.stringify(transformBody));
    const overrides = preserveSystemPrompt ? { compressSystem: false } : {};
    const openAIOptions = mergeCompressionProfileOptions(profile, overrides);
    const result = wireFormat === "claude" ? await transformAnthropicMessages({
      body: encoded,
      model,
      options: { ...overrides, profile: profile.name }
    }) : wireFormat === "openai" ? await transformOpenAIChatCompletions(encoded, openAIOptions) : await transformOpenAIResponses(encoded, openAIOptions);
    const applied = "applied" in result ? result.applied : result.info.compressed;
    if (!applied) return skip(body, result.info?.reason ?? "not_profitable");
    outBody = JSON.parse(new TextDecoder().decode(result.body));
    if (transformBody !== body && body.model !== void 0) outBody.model = body.model;
    accounting = buildOmniGlyphAccounting({
      provider: options?.provider,
      model,
      originalBytes: encoded.byteLength,
      transformedBytes: result.body.byteLength,
      info: result.info,
      durationMs: Date.now() - started
    });
  } catch {
    return skip(body, "transform_error");
  }
  const stats = createCompressionStats(
    body,
    outBody,
    "stacked",
    ["omniglyph:context-as-image"],
    void 0,
    Date.now() - started
  );
  if (accounting) stats.omniglyph = accounting;
  return { body: outBody, compressed: true, stats };
}
const omniglyphEngine = {
  id: "omniglyph",
  name: "OmniGlyph",
  description: "Contexto-como-imagem para Claude Fable 5 na rota direta medida; wires GPT nativos ficam dispon\xEDveis apenas ap\xF3s recibo de fidelidade do provedor.",
  icon: "image",
  targets: ["messages", "tool_results"],
  stackable: true,
  stackPriority: 90,
  // por último: RTK/Caveman limpam texto antes; omniglyph imageia o residual
  sampling: true,
  // perda intencional + factsheet → fidelity gate pula por design
  metadata: {
    id: "omniglyph",
    name: "OmniGlyph",
    description: "Contexto-como-imagem para Claude Fable 5 na rota direta medida; transformadores GPT nativos permanecem fail-closed at\xE9 valida\xE7\xE3o do provedor.",
    inputScope: "mixed",
    targetLatencyMs: 250,
    // render+encode PNG de páginas grandes
    supportsPreview: true,
    stable: false,
    // P1: preview — promover após o e2e P3 (30/30 via OmniRoute)
    executionStages: ["pre-translation", "post-translation"]
  },
  // Contrato da interface: engines async-only mantêm apply síncrono como pass-through seguro.
  apply(body) {
    return { body, compressed: false, stats: null };
  },
  applyAsync: applyOmniglyph,
  compress(body, config) {
    return this.apply(body, { stepConfig: config });
  },
  getConfigSchema() {
    return [];
  },
  validateConfig() {
    return { valid: true, errors: [] };
  }
};
export {
  omniglyphEngine
};
