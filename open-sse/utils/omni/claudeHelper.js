// ADAPTED STUB — OmniRoute `open-sse/translator/helpers/claudeHelper.ts`
// provides Claude-shape request helpers including `prepareClaudeRequest`,
// which prefixes the Claude Code compatible system prompt. OryphemRouter has
// its own Claude translation path (translator/); this minimal version applies
// the prefix so claudeCodeCompatible retains its system-prompt behavior
// without depending on the full helper module.
export function prepareClaudeRequest(request, prefix, _preserveCacheControl) {
  const out = { ...request };
  if (!prefix) return out;
  const system = request?.system;
  if (typeof system === "string") {
    out.system = prefix + "\n\n" + system;
  } else if (Array.isArray(system) && system.length > 0) {
    const first = { ...system[0] };
    if (typeof first.text === "string") {
      first.text = prefix + "\n\n" + first.text;
    } else {
      first.text = prefix;
    }
    out.system = [first, ...system.slice(1)];
  } else if (system == null) {
    out.system = prefix;
  }
  return out;
}
