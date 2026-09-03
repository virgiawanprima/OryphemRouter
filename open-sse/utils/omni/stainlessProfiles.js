// Minimal self-contained adaptation of OmniRoute config/providerHeaderProfiles.ts
// for OryphemRouter. Only the Stainless runtime/OS/arch helpers used by
// glm.js are ported.

export function getRuntimePlatform() {
  return typeof process !== "undefined" && typeof process.platform === "string"
    ? process.platform
    : "unknown";
}

export function getRuntimeArch() {
  return typeof process !== "undefined" && typeof process.arch === "string"
    ? process.arch
    : "unknown";
}

export function getRuntimeVersion() {
  return typeof process !== "undefined" && typeof process.version === "string"
    ? process.version
    : "unknown";
}

export function normalizeStainlessPlatform(platform = getRuntimePlatform()) {
  const normalized = platform.toLowerCase();
  if (normalized.includes("ios")) return "iOS";
  if (normalized === "android") return "Android";
  if (normalized === "darwin") return "MacOS";
  if (normalized === "win32") return "Windows";
  if (normalized === "freebsd") return "FreeBSD";
  if (normalized === "openbsd") return "OpenBSD";
  if (normalized === "linux") return "Linux";
  return normalized ? `Other:${normalized}` : "Unknown";
}

export function normalizeStainlessArch(arch = getRuntimeArch()) {
  if (arch === "x32") return "x32";
  if (arch === "x86_64" || arch === "x64") return "x64";
  if (arch === "arm") return "arm";
  if (arch === "aarch64" || arch === "arm64") return "arm64";
  return arch ? `other:${arch}` : "unknown";
}
