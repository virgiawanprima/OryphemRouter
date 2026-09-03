const LMARENA_AUTH_COOKIE = "arena-auth-prod-v1";
function parseCookieBlob(blob) {
  const pairs = [];
  for (const part of blob.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const value = part.slice(eq + 1).trim();
    pairs.push({ name, value });
  }
  return pairs;
}
function reconstructLMArenaCookie(rawCookie) {
  if (!rawCookie || !rawCookie.trim()) return rawCookie;
  const pairs = parseCookieBlob(rawCookie);
  const existing = pairs.find((p) => p.name === LMARENA_AUTH_COOKIE);
  if (existing && existing.value) return rawCookie;
  const chunkPrefix = `${LMARENA_AUTH_COOKIE}.`;
  const chunks = /* @__PURE__ */ new Map();
  for (const { name, value } of pairs) {
    if (!name.startsWith(chunkPrefix)) continue;
    const idxRaw = name.slice(chunkPrefix.length);
    if (!/^\d+$/.test(idxRaw)) continue;
    chunks.set(Number(idxRaw), value);
  }
  const joinedParts = [];
  for (let i = 0; chunks.has(i); i++) {
    joinedParts.push(chunks.get(i) ?? "");
  }
  const joined = joinedParts.join("");
  if (!joined) return rawCookie;
  const preserved = pairs.filter(
    (p) => p.name !== LMARENA_AUTH_COOKIE && !p.name.startsWith(chunkPrefix)
  );
  return [`${LMARENA_AUTH_COOKIE}=${joined}`, ...preserved.map((p) => `${p.name}=${p.value}`)].join(
    "; "
  );
}
function buildLMArenaCookieFromStoredFields(data) {
  const pairs = [];
  for (const [name, value] of Object.entries(data)) {
    if (name !== LMARENA_AUTH_COOKIE && !name.startsWith(`${LMARENA_AUTH_COOKIE}.`)) {
      continue;
    }
    if (typeof value !== "string" || !value.trim()) continue;
    pairs.push(`${name}=${value.trim()}`);
  }
  if (pairs.length === 0) return "";
  return reconstructLMArenaCookie(pairs.join("; "));
}
function readLMArenaCookie(credentials) {
  if (!credentials || typeof credentials !== "object") return "";
  const c = credentials;
  const direct = typeof c.cookie === "string" ? c.cookie : "";
  if (direct.trim()) return reconstructLMArenaCookie(direct);
  const apiKey = typeof c.apiKey === "string" ? c.apiKey : "";
  if (apiKey.trim()) return reconstructLMArenaCookie(apiKey);
  const topLevelChunks = buildLMArenaCookieFromStoredFields(c);
  if (topLevelChunks) return topLevelChunks;
  const psd = c.providerSpecificData;
  if (psd && typeof psd === "object") {
    const nestedData = psd;
    const nested = nestedData.cookie;
    if (typeof nested === "string" && nested.trim()) return reconstructLMArenaCookie(nested);
    const nestedChunks = buildLMArenaCookieFromStoredFields(nestedData);
    if (nestedChunks) return nestedChunks;
  }
  return "";
}
export {
  LMARENA_AUTH_COOKIE,
  readLMArenaCookie,
  reconstructLMArenaCookie
};
