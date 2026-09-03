/**
 * ADAPTED STUB — OmniRoute's services/autoCombo/builtinCatalog.ts (createBuiltinAutoCombo)
 * is app infra not present in OryphemRouter. No built-in auto/* channels are
 * available; unknown channels throw the same marker error isUnknownAutoChannelError()
 * recognizes so the route maps to 404.
 */
export async function createBuiltinAutoCombo(modelStr) {
  throw new Error(`Unknown built-in auto combo: ${modelStr}`);
}
export default { createBuiltinAutoCombo };
