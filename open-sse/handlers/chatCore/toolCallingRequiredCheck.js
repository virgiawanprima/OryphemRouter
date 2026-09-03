function checkToolCallingRequiredButUnsupported(body, unsupported, isCombo, model) {
  if (isCombo) return { blocked: false };
  if (!unsupported.includes("tools")) return { blocked: false };
  if (!Array.isArray(body.tools) || body.tools.length === 0) return { blocked: false };
  return {
    blocked: true,
    message: `Model "${model}" does not support tool calling. Remove "tools" from the request or choose a different model.`
  };
}
export {
  checkToolCallingRequiredButUnsupported
};
