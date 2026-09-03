import { isIP } from "node:net";
function stripIpv6Brackets(host) {
  if (typeof host !== "string") return "";
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }
  return host;
}
function detectIpLiteralFamily(host) {
  const bare = stripIpv6Brackets(host);
  const v = isIP(bare);
  return v === 0 ? null : v;
}
function parseProxyFamily(value) {
  return value === "ipv4" || value === "ipv6" ? value : "auto";
}
export {
  detectIpLiteralFamily,
  parseProxyFamily,
  stripIpv6Brackets
};
