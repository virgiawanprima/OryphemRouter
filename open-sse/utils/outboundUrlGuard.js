import { ipVersion, isPrivateHost, normalizeHost } from "./privateHost.js";
const PROVIDER_URL_BLOCKED_MESSAGE = "Blocked private or local provider URL";
const CLOUD_METADATA_BLOCKED_MESSAGE = "Blocked cloud-metadata endpoint";
class OutboundUrlGuardError extends Error {
  code;
  url;
  hostname;
  constructor(message, init) {
    super(message);
    this.name = "OutboundUrlGuardError";
    this.code = init.code;
    this.url = init.url;
    this.hostname = init.hostname ?? null;
  }
}
function mappedIpv4Host(hostname) {
  const normalized = normalizeHost(hostname);
  if (!normalized.startsWith("::ffff:")) return null;
  const embedded = normalized.slice("::ffff:".length);
  if (ipVersion(embedded) === 4) return embedded;
  const hextets = embedded.split(":");
  if (hextets.length !== 2) return null;
  const [high, low] = hextets.map(
    (part) => /^[0-9a-f]{1,4}$/.test(part) ? parseInt(part, 16) : Number.NaN
  );
  if (Number.isNaN(high) || Number.isNaN(low)) return null;
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}
const CLOUD_METADATA_HOSTNAMES = /* @__PURE__ */ new Set([
  "169.254.169.254",
  // AWS / GCP / Azure / Oracle IMDS
  "metadata.google.internal",
  // GCP
  "metadata.goog",
  // GCP
  "100.100.100.200",
  // Alibaba Cloud
  "fd00:ec2::254"
  // AWS IPv6 IMDS
]);
function isCloudMetadataIpv4(host) {
  if (CLOUD_METADATA_HOSTNAMES.has(host)) return true;
  return host.startsWith("169.254.");
}
function isCloudMetadataHost(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return false;
  if (isCloudMetadataIpv4(host)) return true;
  const mapped = mappedIpv4Host(host);
  return mapped !== null && isCloudMetadataIpv4(mapped);
}
function parseOutboundUrl(input) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(String(input));
  } catch {
    throw new OutboundUrlGuardError(`Invalid outbound URL: ${String(input)}`, {
      code: "OUTBOUND_URL_INVALID",
      url: String(input)
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OutboundUrlGuardError(`Invalid outbound URL protocol for ${url.toString()}`, {
      code: "OUTBOUND_URL_INVALID",
      url: url.toString(),
      hostname: url.hostname || null
    });
  }
  if (url.username || url.password) {
    throw new OutboundUrlGuardError("Blocked outbound URL with embedded credentials", {
      code: "OUTBOUND_URL_GUARD_BLOCKED",
      url: url.toString(),
      hostname: url.hostname || null
    });
  }
  return url;
}
function parseAndValidatePublicUrl(input) {
  const url = parseOutboundUrl(input);
  if (isPrivateHost(url.hostname)) {
    throw new OutboundUrlGuardError(PROVIDER_URL_BLOCKED_MESSAGE, {
      code: "OUTBOUND_URL_GUARD_BLOCKED",
      url: url.toString(),
      hostname: url.hostname || null
    });
  }
  return url;
}
function parseAndValidateNonMetadataUrl(input) {
  const url = parseOutboundUrl(input);
  if (isCloudMetadataHost(url.hostname)) {
    throw new OutboundUrlGuardError(CLOUD_METADATA_BLOCKED_MESSAGE, {
      code: "OUTBOUND_URL_GUARD_BLOCKED",
      url: url.toString(),
      hostname: url.hostname || null
    });
  }
  return url;
}
export {
  CLOUD_METADATA_BLOCKED_MESSAGE,
  OutboundUrlGuardError,
  PROVIDER_URL_BLOCKED_MESSAGE,
  isCloudMetadataHost,
  isPrivateHost,
  mappedIpv4Host,
  parseAndValidateNonMetadataUrl,
  parseAndValidatePublicUrl,
  parseOutboundUrl
};
