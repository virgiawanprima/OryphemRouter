function parseKimiJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    if (typeof payload !== "object" || payload === null) return null;
    return payload;
  } catch {
    return null;
  }
}
function getKimiTokenExpiration(token) {
  const payload = parseKimiJwt(token);
  if (!payload || typeof payload.exp !== "number") return null;
  const nowSec = Math.floor(Date.now() / 1e3);
  const remainingSec = payload.exp - nowSec;
  return {
    expiresAtSec: payload.exp,
    issuedAtSec: typeof payload.iat === "number" ? payload.iat : 0,
    remainingSec,
    isExpired: remainingSec <= 0
  };
}
function isKimiTokenExpiringSoon(token, thresholdSec = 240) {
  const exp = getKimiTokenExpiration(token);
  if (!exp) return false;
  return exp.remainingSec <= thresholdSec;
}
export {
  getKimiTokenExpiration,
  isKimiTokenExpiringSoon,
  parseKimiJwt
};
