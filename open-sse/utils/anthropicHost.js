function isOfficialAnthropicBaseUrl(baseUrl) {
  if (!baseUrl) return true;
  let host = null;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    try {
      host = new URL(`https://${baseUrl}`).hostname;
    } catch {
      return false;
    }
  }
  return host === "api.anthropic.com";
}
export {
  isOfficialAnthropicBaseUrl
};
