function resolveDedicatedCliproxyapiApiKey(settings) {
  const raw = settings?.cliproxyapi_api_key;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
function resolveCliproxyapiCredentials(connectionCredentials, dedicatedApiKey) {
  if (!dedicatedApiKey) return connectionCredentials;
  return { ...connectionCredentials, apiKey: dedicatedApiKey, accessToken: void 0 };
}
function wrapExecutorWithCliproxyapiCredentials(executor, dedicatedApiKey) {
  if (!dedicatedApiKey) return executor;
  const wrapped = Object.create(executor);
  wrapped.execute = (input) => executor.execute({
    ...input,
    credentials: resolveCliproxyapiCredentials(input.credentials, dedicatedApiKey)
  });
  return wrapped;
}
export {
  resolveCliproxyapiCredentials,
  resolveDedicatedCliproxyapiApiKey,
  wrapExecutorWithCliproxyapiCredentials
};
