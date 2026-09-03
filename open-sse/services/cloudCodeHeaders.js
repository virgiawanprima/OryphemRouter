function getRuntimePlatform() {
  return typeof process !== "undefined" && typeof process.platform === "string" ? process.platform : "unknown";
}
function getRuntimeArch() {
  return typeof process !== "undefined" && typeof process.arch === "string" ? process.arch : "unknown";
}
function getRuntimeNodeVersion() {
  return typeof process !== "undefined" && process.versions?.node ? process.versions.node : "unknown";
}
function normalizeCloudCodePlatform(platform = getRuntimePlatform()) {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    default:
      return platform || "unknown";
  }
}
function normalizeCloudCodeArch(arch = getRuntimeArch()) {
  switch (arch) {
    case "ia32":
      return "x86";
    default:
      return arch || "unknown";
  }
}
function getCloudCodeNodeApiClientHeader(nodeVersion = getRuntimeNodeVersion()) {
  return `gl-node/${nodeVersion.replace(/^v/, "")}`;
}
export {
  getCloudCodeNodeApiClientHeader,
  getRuntimeArch,
  getRuntimeNodeVersion,
  getRuntimePlatform,
  normalizeCloudCodeArch,
  normalizeCloudCodePlatform
};
