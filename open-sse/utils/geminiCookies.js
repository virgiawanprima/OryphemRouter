function cookiePairsFromJson(raw) {
  if (!raw.startsWith("{")) return [];
  try {
    const parsed = JSON.parse(raw);
    const cookies = parsed.cookies && typeof parsed.cookies === "object" && !Array.isArray(parsed.cookies) ? parsed.cookies : parsed;
    return Object.entries(cookies).filter(([, value]) => typeof value === "string" && value.trim().length > 0).map(([name, value]) => `${name}=${String(value).trim()}`);
  } catch {
    return [];
  }
}
function normalizeGeminiCookieInput(raw, cookieName = "__Secure-1PSID") {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const jsonPairs = cookiePairsFromJson(trimmed);
  if (jsonPairs.length > 0) return jsonPairs.join("; ");
  return trimmed.includes("=") ? trimmed : `${cookieName}=${trimmed}`;
}
export {
  normalizeGeminiCookieInput
};
