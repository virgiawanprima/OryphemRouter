function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function hasOpenAIChoices(value) {
  return isRecord(value) && Array.isArray(value.choices);
}
function unwrapClineNonStreamingEnvelope(provider, responseBody) {
  if (provider !== "cline" || !isRecord(responseBody)) {
    return responseBody;
  }
  const data = responseBody.data;
  if (!hasOpenAIChoices(data)) {
    return responseBody;
  }
  return {
    ...data,
    usage: isRecord(data) && data.usage !== void 0 ? data.usage : responseBody.usage
  };
}
export {
  unwrapClineNonStreamingEnvelope
};
