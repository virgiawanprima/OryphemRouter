const CC_DISCOVERY_PREFIX = "claude/";
const CC_DISCOVERY_COMBO_PREFIX = "claude/combo/";
const ALREADY_CLAUDE_RE = /^(?:claude|anthropic)(?:\/|$)/i;
const CLAUDE_EFFORT_SUFFIX_RE = /-(?:xhigh|high|medium|low)$/i;
const NO_THINKING_PREFIX = "no-think/";
const BUILTIN_AUTO_COMBO_RE = /^auto(?:\/|$)/;
function isMirrorableId(id) {
  if (id.length === 0) return false;
  if (ALREADY_CLAUDE_RE.test(id)) return false;
  if (id.startsWith(NO_THINKING_PREFIX)) return false;
  return !CLAUDE_EFFORT_SUFFIX_RE.test(id);
}
function bareModelName(id) {
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}
function appendCcDiscoveryAliases(models, isEnabled) {
  if (!Array.isArray(models)) return models;
  const aliases = [];
  for (const model of models) {
    const id = model.id;
    if (typeof id !== "string" || !isMirrorableId(id)) continue;
    if (!isEnabled(model)) continue;
    const isCombo = model.owned_by === "combo";
    if (isCombo && BUILTIN_AUTO_COMBO_RE.test(id)) continue;
    const aliasId = isCombo ? `${CC_DISCOVERY_COMBO_PREFIX}${id}` : `${CC_DISCOVERY_PREFIX}${id}`;
    const label = typeof model.name === "string" && model.name ? model.name : id;
    aliases.push({
      ...model,
      id: aliasId,
      // Combo names may legally contain "/" (comboNameSchema allows it), so a combo's
      // root must stay the full name verbatim — only real provider-qualified ids get
      // the "/" stripped down to the bare model name.
      root: isCombo ? id : bareModelName(id),
      display_name: `${label} (OmniRoute)`
    });
  }
  return aliases.length > 0 ? [...models, ...aliases] : models;
}
export {
  CC_DISCOVERY_COMBO_PREFIX,
  CC_DISCOVERY_PREFIX,
  appendCcDiscoveryAliases
};
