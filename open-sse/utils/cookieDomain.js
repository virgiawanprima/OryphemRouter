function matchesCookieDomain(cookieDomain, expectedDomain) {
  const expected = normalizeCookieDomain(expectedDomain);
  if (!expected) return false;
  const actual = normalizeCookieDomain(cookieDomain);
  if (!actual) return false;
  return actual === expected || actual.endsWith(`.${expected}`);
}
function normalizeCookieDomain(domain) {
  return String(domain || "").trim().replace(/^\.+/, "").toLowerCase();
}
export {
  matchesCookieDomain
};
