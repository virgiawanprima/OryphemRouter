const ADOBE_JWT_IN_TEXT_REGEX = /eyJ[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}/;
const ADOBE_JWT_IN_TEXT_GLOBAL_REGEX = /eyJ[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}/g;
const ADOBE_JWT_EXACT_REGEX = /^eyJ[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}$/;
const FIREFLY_3P_HOST_SUFFIX = "firefly-3p.ff.adobe.io";
function decodeAdobeJwtPayload(token) {
  try {
    let raw = String(token || "").trim().replace(/^bearer\s+/i, "").trim();
    const match = raw.match(ADOBE_JWT_IN_TEXT_REGEX);
    if (match) raw = match[0];
    const part = raw.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const value = JSON.parse(json);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}
function findAllAdobeJwts(value) {
  return value.match(ADOBE_JWT_IN_TEXT_GLOBAL_REGEX) ?? [];
}
function isExactAdobeJwt(value) {
  return ADOBE_JWT_EXACT_REGEX.test(value);
}
function stripAdobeJwts(value, replacement = "") {
  return value.replace(ADOBE_JWT_IN_TEXT_GLOBAL_REGEX, replacement);
}
function hostnameMatches(hostname, expected) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === expected || normalized.endsWith(`.${expected}`);
}
function isAdobeFireflyApiUrl(rawUrl) {
  try {
    return hostnameMatches(new URL(rawUrl).hostname, FIREFLY_3P_HOST_SUFFIX);
  } catch {
    return false;
  }
}
function isAdobeLoginCookieDomain(domain) {
  return hostnameMatches(domain.replace(/^\./, ""), "adobelogin.com");
}
export {
  decodeAdobeJwtPayload,
  findAllAdobeJwts,
  isAdobeFireflyApiUrl,
  isAdobeLoginCookieDomain,
  isExactAdobeJwt,
  stripAdobeJwts
};
