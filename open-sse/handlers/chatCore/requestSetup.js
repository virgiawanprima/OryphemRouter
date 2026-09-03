function resolveChatCoreRequestSetup(modelInfo, body, model) {
  const apiFormat = modelInfo && typeof modelInfo === "object" && "apiFormat" in modelInfo ? typeof modelInfo.apiFormat === "string" ? modelInfo.apiFormat : void 0 : void 0;
  const customModelTargetFormat = modelInfo && typeof modelInfo === "object" && "targetFormat" in modelInfo ? typeof modelInfo.targetFormat === "string" ? modelInfo.targetFormat : void 0 : void 0;
  const requestedModel = typeof body?.model === "string" && body.model.trim().length > 0 ? body.model : model;
  return { apiFormat, customModelTargetFormat, requestedModel };
}
export {
  resolveChatCoreRequestSetup
};
