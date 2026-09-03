function resolveMappedModel(model, mapping) {
  if (!mapping || typeof mapping !== "object") return null;
  const mapped = mapping[model];
  return typeof mapped === "string" && mapped.trim() ? mapped : null;
}
function applyCliproxyapiModelMapping(input, mapping) {
  const mappedModel = resolveMappedModel(input.model, mapping);
  if (!mappedModel) return input;
  const body = input.body && typeof input.body === "object" && !Array.isArray(input.body) ? { ...input.body, model: mappedModel } : input.body;
  return { ...input, model: mappedModel, body };
}
function wrapExecutorWithCliproxyapiModelMapping(executor, mapping) {
  if (!mapping || typeof mapping !== "object" || Object.keys(mapping).length === 0) {
    return executor;
  }
  const wrapped = Object.create(executor);
  wrapped.execute = (input) => executor.execute(applyCliproxyapiModelMapping(input, mapping));
  return wrapped;
}
export {
  applyCliproxyapiModelMapping,
  wrapExecutorWithCliproxyapiModelMapping
};
