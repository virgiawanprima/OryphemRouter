import os from "node:os";
import path from "node:path";
import fs from "node:fs";
const OPTIONAL_PACK_NAMES = ["ml-runtime", "browser-runtime"];
const PACK_INDEX_FILENAME = "optional-packs.index.json";
function resolveDataDir(override) {
  return override || process.env.DATA_DIR || path.join(os.homedir(), ".omniroute");
}
function packsRootDir(dataDirOverride) {
  return path.join(resolveDataDir(dataDirOverride), "packs");
}
function packInstallDir(name, dataDirOverride) {
  return path.join(packsRootDir(dataDirOverride), name);
}
function packNodeModulesDir(name, dataDirOverride) {
  return path.join(packInstallDir(name, dataDirOverride), "node_modules");
}
function installedPackNodePaths(dataDirOverride) {
  const entries = [];
  for (const name of OPTIONAL_PACK_NAMES) {
    const dir = packNodeModulesDir(name, dataDirOverride);
    try {
      if (fs.statSync(dir).isDirectory()) entries.push(dir);
    } catch {
    }
  }
  return entries;
}
function packMemberInstalled(memberRelPath, dataDirOverride) {
  const segments = memberRelPath.split(/[\\/]/).filter(Boolean);
  if (segments[0] === "node_modules") segments.shift();
  if (segments.length === 0) return false;
  for (const nodeModulesDir of installedPackNodePaths(dataDirOverride)) {
    if (fs.existsSync(path.join(nodeModulesDir, ...segments))) return true;
  }
  return false;
}
export {
  OPTIONAL_PACK_NAMES,
  PACK_INDEX_FILENAME,
  installedPackNodePaths,
  packInstallDir,
  packMemberInstalled,
  packNodeModulesDir,
  packsRootDir
};
