const CC_WIRE_IMAGE_BUILTINS = /* @__PURE__ */ new Set(["agentrouter"]);
function usesCcWireImage(provider) {
  return typeof provider === "string" && CC_WIRE_IMAGE_BUILTINS.has(provider);
}
export {
  CC_WIRE_IMAGE_BUILTINS,
  usesCcWireImage
};
