const requestRegistry = /* @__PURE__ */ new Map();
const responseRegistry = /* @__PURE__ */ new Map();
function makeKey(from, to) {
  return `${from}:${to}`;
}
function register(from, to, requestFn, responseFn) {
  const key = makeKey(from, to);
  if (requestFn) {
    requestRegistry.set(key, requestFn);
  }
  if (responseFn) {
    responseRegistry.set(key, responseFn);
  }
}
function getRequestTranslator(from, to) {
  return requestRegistry.get(makeKey(from, to));
}
function getResponseTranslator(from, to) {
  return responseRegistry.get(makeKey(from, to));
}
export {
  getRequestTranslator,
  getResponseTranslator,
  register
};
