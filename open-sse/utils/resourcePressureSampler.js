import fs from "node:fs/promises";
import path from "node:path";
import v8 from "node:v8";
const DEFAULT_CGROUP_ROOT = "/sys/fs/cgroup";
async function defaultReadText(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
function sanitizeMemoryBytes(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "max" || !/^\d+$/.test(trimmed) || trimmed.length > 15) {
      return null;
    }
    value = Number(trimmed);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value >= Number.MAX_SAFE_INTEGER) return null;
  return Math.floor(value);
}
function safeNumber(call) {
  try {
    return call ? sanitizeMemoryBytes(call()) : null;
  } catch {
    return null;
  }
}
function decodeMountInfoPath(value) {
  if (value.includes("\0")) return null;
  try {
    return value.replace(
      /\\([0-7]{3})/g,
      (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8))
    );
  } catch {
    return null;
  }
}
function parseCgroupV2Path(contents) {
  if (!contents) return null;
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("0::")) continue;
    const relativePath = line.slice(3);
    if (!relativePath.startsWith("/") || relativePath.includes("\0")) return null;
    return relativePath;
  }
  return null;
}
function parseCgroup2Mount(contents) {
  if (!contents) return null;
  for (const rawLine of contents.split("\n")) {
    const separator = rawLine.indexOf(" - ");
    if (separator < 0) continue;
    const left = rawLine.slice(0, separator).trim().split(/\s+/);
    const right = rawLine.slice(separator + 3).trim().split(/\s+/);
    if (right[0] !== "cgroup2" || left.length < 5) continue;
    const root = decodeMountInfoPath(left[3]);
    const mountpoint = decodeMountInfoPath(left[4]);
    if (!root?.startsWith("/") || !mountpoint?.startsWith("/")) return null;
    return { root, mountpoint };
  }
  return null;
}
function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}
function hasTraversalSegment(value) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return true;
  }
  return decoded.split("/").some((segment) => segment === ".." || segment === ".");
}
function resolveFromMount(cgroupPath, mount) {
  if (cgroupPath.includes("\0") || mount.root.includes("\0") || mount.mountpoint.includes("\0") || hasTraversalSegment(cgroupPath)) {
    return null;
  }
  const resolvedRoot = path.resolve(mount.root);
  const resolvedCgroup = path.resolve(cgroupPath);
  if (!isContained(resolvedRoot, resolvedCgroup)) return null;
  const suffix = path.relative(resolvedRoot, resolvedCgroup);
  const resolvedMountpoint = path.resolve(mount.mountpoint);
  const candidate = path.resolve(resolvedMountpoint, suffix);
  return isContained(resolvedMountpoint, candidate) ? candidate : null;
}
async function resolveCgroupDirectory(readText, options = {}) {
  try {
    const [cgroupContents, mountInfo] = await Promise.all([
      readText("/proc/self/cgroup"),
      readText("/proc/self/mountinfo")
    ]);
    const cgroupPath = parseCgroupV2Path(cgroupContents);
    const mount = parseCgroup2Mount(mountInfo);
    if (cgroupPath && mount) {
      const candidate = resolveFromMount(cgroupPath, mount);
      if (candidate && await readText(path.join(candidate, "memory.current")) != null) {
        return candidate;
      }
      if (!candidate) return null;
    }
    if (options.allowDefaultFallback === false) return null;
    return await readText(path.join(DEFAULT_CGROUP_ROOT, "memory.current")) != null ? DEFAULT_CGROUP_ROOT : null;
  } catch {
    return null;
  }
}
function parseEventCounter(value) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 && parsed < Number.MAX_SAFE_INTEGER ? Math.floor(parsed) : null;
}
function parseMemoryEvents(text) {
  if (!text) return null;
  const values = { low: null, high: null, max: null, oom: null, oom_kill: null };
  let matched = false;
  for (const line of text.split("\n")) {
    const [key, rawValue] = line.trim().split(/\s+/, 2);
    if (!(key in values) || rawValue == null) continue;
    values[key] = parseEventCounter(rawValue);
    matched = true;
  }
  return matched ? values : null;
}
function parsePsiNumber(line, name) {
  const match = new RegExp(`(?:^|\\s)${name}=([0-9.]+)`).exec(line);
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function parsePsi(text) {
  if (!text) return null;
  const result = {
    someAvg10: null,
    someAvg60: null,
    someAvg300: null,
    fullAvg10: null,
    fullAvg60: null,
    fullAvg300: null
  };
  let matched = false;
  for (const line of text.split("\n")) {
    const kind = line.startsWith("some ") ? "some" : line.startsWith("full ") ? "full" : null;
    if (!kind) continue;
    result[`${kind}Avg10`] = parsePsiNumber(line, "avg10");
    result[`${kind}Avg60`] = parsePsiNumber(line, "avg60");
    result[`${kind}Avg300`] = parsePsiNumber(line, "avg300");
    matched = true;
  }
  return matched ? result : null;
}
async function sampleResourceSignals(deps = {}) {
  const readText = deps.fs?.readText ?? defaultReadText;
  let memory;
  try {
    memory = (deps.memoryUsage ?? process.memoryUsage)();
  } catch {
    memory = { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
  }
  let heapUsed = Math.max(0, Math.floor(memory.heapUsed || 0));
  let heapLimit = 0;
  try {
    const heap = (deps.heapStatistics ?? v8.getHeapStatistics)();
    heapLimit = sanitizeMemoryBytes(heap.heap_size_limit) ?? 0;
    if (Number.isFinite(heap.used_heap_size)) {
      heapUsed = Math.max(0, Math.floor(heap.used_heap_size ?? heapUsed));
    }
  } catch {
  }
  const cgroupDirectory = await resolveCgroupDirectory(readText);
  const cgroupContents = cgroupDirectory ? await Promise.all([
    readText(path.join(cgroupDirectory, "memory.current")),
    readText(path.join(cgroupDirectory, "memory.max")),
    readText(path.join(cgroupDirectory, "memory.high")),
    readText(path.join(cgroupDirectory, "memory.events"))
  ]) : [null, null, null, null];
  const psi = await readText("/proc/pressure/memory").catch(() => null);
  return {
    observedAtMs: (deps.nowMs ?? Date.now)(),
    v8: { heapUsedBytes: heapUsed, heapLimitBytes: heapLimit },
    process: {
      rssBytes: Math.max(0, Math.floor(memory.rss || 0)),
      externalBytes: Math.max(0, Math.floor(memory.external || 0)),
      arrayBuffersBytes: Math.max(0, Math.floor(memory.arrayBuffers || 0)),
      availableBytes: safeNumber(deps.availableMemory ?? (() => process.availableMemory?.())),
      constrainedBytes: safeNumber(deps.constrainedMemory ?? (() => process.constrainedMemory?.()))
    },
    cgroup: {
      currentBytes: sanitizeMemoryBytes(cgroupContents[0]),
      maxBytes: sanitizeMemoryBytes(cgroupContents[1]),
      highBytes: sanitizeMemoryBytes(cgroupContents[2]),
      events: parseMemoryEvents(cgroupContents[3])
    },
    psi: parsePsi(psi)
  };
}
export {
  decodeMountInfoPath,
  parseCgroup2Mount,
  parseCgroupV2Path,
  resolveCgroupDirectory,
  sampleResourceSignals,
  sanitizeMemoryBytes
};
