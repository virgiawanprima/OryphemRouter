import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { detectCommandType } from "./commandDetector.js";
import { validateRtkFilter } from "./filterSchema.js";
import { parseRtkTomlV1, RtkTomlCompatibilityError } from "./tomlCompatibility.js";
let cache = null;
let cacheKey = null;
let diagnostics = [];
const regexCache = /* @__PURE__ */ new Map();
function cachedMatchPattern(pattern, value) {
  const key = `${pattern}::im`;
  let re = regexCache.get(key);
  if (!re) {
    try {
      re = new RegExp(pattern, "im");
      regexCache.set(key, re);
    } catch {
      return false;
    }
  }
  return re.test(value);
}
function getModuleDir() {
  const anchors = [process.cwd()];
  const argv1 = process.argv[1];
  if (typeof argv1 === "string" && argv1) anchors.push(path.dirname(argv1));
  const rel = path.join("open-sse", "services", "compression");
  for (const anchor of anchors) {
    let dir = path.resolve(anchor);
    for (let i = 0; i <= 8; i++) {
      if (fs.existsSync(path.join(dir, rel))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return path.join(os.homedir(), ".omniroute");
}
function getFiltersDir() {
  const root = getModuleDir();
  const candidates = [
    path.join(root, "open-sse", "services", "compression", "engines", "rtk", "filters"),
    path.join(root, "app", "open-sse", "services", "compression", "engines", "rtk", "filters")
  ];
  return candidates.find((candidate, index) => {
    return candidates.indexOf(candidate) === index && fs.existsSync(candidate);
  }) ?? candidates[0];
}
function getDataDir() {
  return process.env.DATA_DIR || path.join(os.homedir(), ".omniroute");
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function projectFiltersTrusted(filtersPath, trustProjectFilters = false) {
  if (trustProjectFilters) return true;
  if (process.env.OMNIROUTE_RTK_TRUST_PROJECT_FILTERS === "1") return true;
  const trustPath = path.join(path.dirname(filtersPath), "trust.json");
  if (!fs.existsSync(trustPath)) return false;
  try {
    const filtersHash = sha256(fs.readFileSync(filtersPath, "utf8"));
    const trust = JSON.parse(fs.readFileSync(trustPath, "utf8"));
    const isToml = filtersPath.endsWith(".toml");
    const trustedHash = isToml ? typeof trust.filtersTomlSha256 === "string" ? trust.filtersTomlSha256 : null : typeof trust.filtersSha256 === "string" ? trust.filtersSha256 : typeof trust.trustedFiltersSha256 === "string" ? trust.trustedFiltersSha256 : null;
    if (!trustedHash) return false;
    return trustedHash === filtersHash ? true : "changed";
  } catch {
    return false;
  }
}
function collectFilterSources(options = {}) {
  const sources = [];
  if (options.customFiltersEnabled !== false) {
    collectProjectFilterSources(sources, options);
    collectGlobalFilterSources(sources);
  }
  collectBuiltinFilterSources(sources);
  return sources;
}
function collectProjectFilterSources(sources, options) {
  const projectCandidates = [
    { path: path.join(process.cwd(), ".rtk", "filters.toml"), format: "rtk-toml-v1" },
    { path: path.join(process.cwd(), ".rtk", "filters.json"), format: "omniroute-json" }
  ];
  for (const candidate of projectCandidates) {
    if (!fs.existsSync(candidate.path)) continue;
    const trusted = projectFiltersTrusted(candidate.path, options.trustProjectFilters === true);
    if (trusted === true) {
      sources.push({ source: "project", ...candidate, trusted: true });
      continue;
    }
    diagnostics.push({
      source: "project",
      format: candidate.format,
      path: candidate.path,
      level: "warning",
      message: trusted === "changed" ? "Project RTK filters changed after trust and were skipped" : "Project RTK filters are untrusted and were skipped"
    });
  }
}
function collectGlobalFilterSources(sources) {
  const globalCandidates = [
    { path: path.join(getDataDir(), "rtk", "filters.toml"), format: "rtk-toml-v1" },
    { path: path.join(getDataDir(), "rtk", "filters.json"), format: "omniroute-json" }
  ];
  for (const candidate of globalCandidates) {
    if (fs.existsSync(candidate.path)) {
      sources.push({ source: "global", ...candidate, trusted: true });
    }
  }
}
function collectBuiltinFilterSources(sources) {
  const builtinDir = getFiltersDir();
  if (fs.existsSync(builtinDir)) {
    let builtinFiles = [];
    try {
      builtinFiles = fs.readdirSync(builtinDir).filter((entry) => entry.endsWith(".json")).sort();
    } catch {
      builtinFiles = [];
    }
    for (const file of builtinFiles) {
      sources.push({
        source: "builtin",
        path: path.join(builtinDir, file),
        trusted: true,
        format: "omniroute-json"
      });
    }
  }
}
function parseFilterFile(source) {
  try {
    const content = fs.readFileSync(source.path, "utf8");
    const definitions = source.format === "rtk-toml-v1" ? (() => {
      const result = parseRtkTomlV1(content);
      if (!result.passed) {
        throw new Error("one or more inline tests failed");
      }
      for (const warning of result.warnings) {
        diagnostics.push({
          source: source.source,
          format: source.format,
          path: source.path,
          level: "warning",
          message: warning
        });
      }
      return result.filters;
    })() : (() => {
      const parsed = JSON.parse(content);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      return entries.map(validateRtkFilter);
    })();
    return definitions.map((definition) => ({
      ...definition,
      source: source.source,
      sourceFormat: definition.sourceFormat ?? source.format
    }));
  } catch (error) {
    const message = error instanceof RtkTomlCompatibilityError ? error.publicMessage : error instanceof Error ? error.message : String(error);
    if (source.source === "builtin") {
      throw new Error(`Invalid RTK filter ${path.basename(source.path)}: ${message}`);
    }
    diagnostics.push({
      source: source.source,
      format: source.format,
      path: source.path,
      level: "warning",
      message: `Invalid custom RTK filter skipped: ${message}`
    });
    return [];
  }
}
function loadRtkFilters(options = {}) {
  const currentCacheKey = [
    process.cwd(),
    getDataDir(),
    options.customFiltersEnabled === false ? "builtin-only" : "custom",
    options.trustProjectFilters === true ? "trusted-project" : "trust-file",
    process.env.OMNIROUTE_RTK_TRUST_PROJECT_FILTERS === "1" ? "env-trust" : "env-normal"
  ].join("|");
  if (cache && cacheKey === currentCacheKey && !options.refresh) return cache;
  diagnostics = [];
  const filters = [];
  for (const source of collectFilterSources(options)) {
    filters.push(...parseFilterFile(source));
  }
  const sourceRank = { project: 3, global: 2, builtin: 1 };
  const formatRank = { "rtk-toml-v1": 2, "omniroute-json": 1 };
  const sorted = filters.sort(
    (a, b) => sourceRank[b.source ?? "builtin"] - sourceRank[a.source ?? "builtin"] || formatRank[b.sourceFormat ?? "omniroute-json"] - formatRank[a.sourceFormat ?? "omniroute-json"] || b.priority - a.priority || a.id.localeCompare(b.id)
  );
  cache = sorted;
  cacheKey = currentCacheKey;
  return sorted;
}
function getRtkFilterLoadDiagnostics() {
  loadRtkFilters();
  return diagnostics.map((entry) => ({ ...entry }));
}
function getRtkFilterCatalog() {
  return loadRtkFilters().map((filter) => ({
    id: filter.id,
    name: filter.name,
    description: filter.description,
    commandTypes: filter.commandTypes,
    category: filter.category,
    priority: filter.priority,
    source: filter.source,
    sourceFormat: filter.sourceFormat
  }));
}
function matchRtkFilter(text, command, options = {}) {
  const detection = detectCommandType(text, command);
  const detectedCommand = detection.command ?? command ?? "";
  const filters = loadRtkFilters(options);
  for (const source of ["project", "global", "builtin"]) {
    const scoped = filters.filter((filter) => (filter.source ?? "builtin") === source);
    const matched = scoped.find(
      (filter) => filter.sourceFormat === "rtk-toml-v1" && detectedCommand && filter.commandPatterns.some((pattern) => cachedMatchPattern(pattern, detectedCommand))
    ) ?? scoped.find((filter) => filter.commandTypes.includes(detection.type)) ?? scoped.find(
      (filter) => detectedCommand && filter.commandPatterns.some((pattern) => cachedMatchPattern(pattern, detectedCommand))
    ) ?? scoped.find(
      (filter) => filter.matchPatterns.some((pattern) => cachedMatchPattern(pattern, text))
    );
    if (matched) return matched;
  }
  return filters.find((filter) => filter.commandTypes.includes("generic-output")) ?? null;
}
export {
  getRtkFilterCatalog,
  getRtkFilterLoadDiagnostics,
  loadRtkFilters,
  matchRtkFilter
};
