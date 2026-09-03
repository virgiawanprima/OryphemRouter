import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { log as engineLog, sanitize } from "../../../../utils/log.js";
const SECRET_PATTERNS = [
  [/\b(sk-[A-Za-z0-9_-]{16,})\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\b(xox[baprs]-[A-Za-z0-9-]{16,})\b/g, "[REDACTED_SLACK_TOKEN]"],
  [/\b(AKIA[0-9A-Z]{16})\b/g, "[REDACTED_AWS_KEY]"],
  // key=value / key: value for common credential field names (flat alternation — no nesting,
  // so no ReDoS). Covers names the bare token/secret/password set misses (private_key, etc).
  [
    /((?:api[_-]?key|api[_-]?token|access[_-]?key|access[_-]?token|client[_-]?secret|auth[_-]?token|private[_-]?key|secret[_-]?key|credentials?|token|secret|password)\s*[:=]\s*)("[^"]+"|'[^']+'|[^\s]+)/gi,
    "$1[REDACTED]"
  ],
  // Authorization / Proxy-Authorization with Bearer OR Basic (curl -v emits Basic <base64>).
  [/((?:Proxy-)?Authorization:\s*(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]"]
];
function dataDir() {
  return process.env.DATA_DIR || path.join(os.homedir(), ".omniroute");
}
function safeId(seed) {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 24);
}
function safeUtf8Slice(value, maxBytes) {
  if (maxBytes <= 0 || Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let bytes = 0;
  let output = "";
  for (const char of value) {
    const len = Buffer.byteLength(char, "utf8");
    if (bytes + len > maxBytes) break;
    output += char;
    bytes += len;
  }
  return `${output}

--- truncated at ${maxBytes} bytes ---`;
}
function redactRtkRawOutput(value) {
  let redacted = false;
  let text = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    const next = text.replace(pattern, (...args) => {
      redacted = true;
      return typeof replacement === "string" ? replacement.replace("$1", args[1] ?? "") : replacement;
    });
    text = next;
  }
  return { text, redacted };
}
function isLikelyFailureOutput(value) {
  return /\b(error|failed|failure|exception|traceback|panic|fatal|critical|TS\d{4}|FAIL)\b/i.test(
    value
  );
}
const RAW_OUTPUT_BUCKET_LEN = 2;
const LEGACY_FLAT_SCAN_GUARD = 1e5;
function rawOutputDir() {
  return path.join(dataDir(), "rtk", "raw-output");
}
function bucketDir(id) {
  return path.join(rawOutputDir(), id.slice(0, RAW_OUTPUT_BUCKET_LEN));
}
function maybePersistRtkRawOutput(raw, options) {
  if (options.retention === "never") return null;
  const failure = options.failure ?? isLikelyFailureOutput(raw);
  if (options.retention === "failures" && !failure) return null;
  if (raw.trim().length === 0) return null;
  const maxBytes = Math.max(1024, Math.floor(options.maxBytes ?? 1048576));
  const redaction = redactRtkRawOutput(safeUtf8Slice(raw, maxBytes));
  const now = Date.now();
  const commandSlug = (options.command || "tool-output").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  const id = safeId(`${now}:${commandSlug}:${raw.length}:${redaction.text}`);
  const dir = bucketDir(id);
  const fileName = `${now}-${commandSlug || "tool-output"}-${id}.log`;
  const filePath = path.join(dir, fileName);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, redaction.text);
  } catch {
    return null;
  }
  try {
    const metaPath = filePath.replace(/\.log$/, ".meta.json");
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        command: options.command ?? null,
        timestamp: now,
        failure,
        redacted: redaction.redacted,
        bytes: Buffer.byteLength(redaction.text, "utf8")
      })
    );
  } catch {
  }
  return {
    id,
    path: filePath,
    bytes: Buffer.byteLength(redaction.text, "utf8"),
    sha256: crypto.createHash("sha256").update(redaction.text).digest("hex"),
    redacted: redaction.redacted
  };
}
function readRtkRawOutput(pointerId) {
  const dir = rawOutputDir();
  if (!fs.existsSync(dir)) return null;
  const bucket = bucketDir(pointerId);
  if (fs.existsSync(bucket)) {
    const entry2 = fs.readdirSync(bucket).find((file) => file.endsWith(".log") && file.includes(pointerId));
    if (entry2) {
      const fullPath2 = path.join(bucket, entry2);
      if (!fullPath2.startsWith(dir)) return null;
      return fs.readFileSync(fullPath2, "utf8");
    }
  }
  const entries = fs.readdirSync(dir);
  if (entries.length > LEGACY_FLAT_SCAN_GUARD) {
    engineLog.warn(
      "RTK",
      `[rtk-raw-output] legacy flat store has ${entries.length} entries; skipping O(n) pointer scan for ${pointerId}`
    );
    return null;
  }
  const entry = entries.find((file) => file.endsWith(".log") && file.includes(pointerId));
  if (!entry) return null;
  const fullPath = path.join(dir, entry);
  if (!fullPath.startsWith(dir)) return null;
  return fs.readFileSync(fullPath, "utf8");
}
function commandFromSlug(fileName) {
  const slug = fileName.replace(/^\d+-/, "").replace(/-[0-9a-f]{24}\.log$/i, "").replace(/\.log$/i, "");
  return slug.replace(/_+/g, " ").trim();
}
function collectRawOutputLogFiles(dir) {
  const logs = [];
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return logs;
  }
  if (entries.length <= LEGACY_FLAT_SCAN_GUARD) {
    for (const entry of entries) {
      if (entry.endsWith(".log")) logs.push({ name: entry, fullPath: path.join(dir, entry) });
    }
  } else {
    engineLog.warn(
      "RTK",
      `[rtk-raw-output] legacy flat store has ${entries.length} entries; skipping sample scan this run`
    );
  }
  for (const entry of entries) {
    if (entry.length !== RAW_OUTPUT_BUCKET_LEN) continue;
    const subPath = path.join(dir, entry);
    let isDir = false;
    try {
      isDir = fs.statSync(subPath).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    let subEntries;
    try {
      subEntries = fs.readdirSync(subPath);
    } catch {
      continue;
    }
    for (const name of subEntries) {
      if (name.endsWith(".log")) logs.push({ name, fullPath: path.join(subPath, name) });
    }
  }
  return logs;
}
function listRtkCommandSamples(opts = {}) {
  const dir = rawOutputDir();
  if (!fs.existsSync(dir)) return [];
  const limit = Math.max(1, Math.floor(opts.limit ?? 500));
  const logs = collectRawOutputLogFiles(dir);
  logs.sort((a, b) => a.name < b.name ? 1 : a.name > b.name ? -1 : 0);
  const samples = [];
  for (const { name, fullPath } of logs) {
    if (samples.length >= limit) break;
    let output;
    try {
      output = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }
    if (output.trim().length === 0) continue;
    let command = "";
    try {
      const metaRaw = fs.readFileSync(fullPath.replace(/\.log$/, ".meta.json"), "utf8");
      const meta = JSON.parse(metaRaw);
      if (typeof meta.command === "string" && meta.command.trim()) command = meta.command.trim();
    } catch {
    }
    if (!command) command = commandFromSlug(name) || "tool-output";
    samples.push({ command, output });
  }
  return samples;
}
const PURGE_THROTTLE_MS = 6e4;
let lastRawOutputPurgeAt = 0;
function resetRtkRawOutputPurgeThrottle() {
  lastRawOutputPurgeAt = 0;
}
async function mapLimit(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
async function purgeRtkRawOutput(opts = {}) {
  const now = Date.now();
  if (now - lastRawOutputPurgeAt < PURGE_THROTTLE_MS) {
    return { skipped: true, scanned: 0, deleted: 0, errors: 0 };
  }
  lastRawOutputPurgeAt = now;
  const maxAgeDays = Math.max(1, Math.floor(opts.maxAgeDays ?? 30));
  const maxFiles = Math.max(1, Math.floor(opts.maxFiles ?? 1e5));
  const maxAgeMs = maxAgeDays * 864e5;
  const dir = rawOutputDir();
  const result = { skipped: false, scanned: 0, deleted: 0, errors: 0 };
  if (!fs.existsSync(dir)) return result;
  try {
    const candidates = [];
    const flat = await fsp.readdir(dir);
    if (flat.length > LEGACY_FLAT_SCAN_GUARD) {
      engineLog.warn(
        "RTK",
        `[rtk-raw-output] legacy flat store has ${flat.length} entries; purge skips flat scan this run (one-off manual cleanup recommended)`
      );
    } else {
      for (const name of flat) {
        if (!name.endsWith(".log")) continue;
        candidates.push({
          file: path.join(dir, name),
          meta: path.join(dir, name.replace(/\.log$/, ".meta.json")),
          ts: parseInt(name, 10) || 0
        });
      }
    }
    for (const entry of flat) {
      if (entry.length !== RAW_OUTPUT_BUCKET_LEN) continue;
      const subPath = path.join(dir, entry);
      let isDir = false;
      try {
        isDir = (await fsp.stat(subPath)).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      let subEntries;
      try {
        subEntries = await fsp.readdir(subPath);
      } catch {
        continue;
      }
      for (const name of subEntries) {
        if (!name.endsWith(".log")) continue;
        candidates.push({
          file: path.join(subPath, name),
          meta: path.join(subPath, name.replace(/\.log$/, ".meta.json")),
          ts: parseInt(name, 10) || 0
        });
      }
    }
    result.scanned = candidates.length;
    const agedOut = candidates.filter((c) => c.ts > 0 && now - c.ts > maxAgeMs);
    const remaining = candidates.filter((c) => !agedOut.includes(c));
    remaining.sort((a, b) => b.ts - a.ts || (a.file < b.file ? 1 : -1));
    const keep = new Set(remaining.slice(0, maxFiles).map((c) => c.file));
    const overflow = remaining.filter((c) => !keep.has(c.file));
    await mapLimit([...agedOut, ...overflow], 32, async (c) => {
      try {
        await fsp.unlink(c.file);
        result.deleted++;
      } catch {
        result.errors++;
      }
      if (c.meta) {
        try {
          await fsp.unlink(c.meta);
        } catch {
        }
      }
    });
    if (result.deleted > 0 || result.errors > 0) {
      engineLog.info(
        "RTK",
        `[rtk-raw-output] purge: scanned=${result.scanned} deleted=${result.deleted} errors=${result.errors} (maxFiles=${maxFiles}, maxAgeDays=${maxAgeDays})`
      );
    }
  } catch (err) {
    engineLog.warn("RTK", "[rtk-raw-output] purge failed:", sanitize(err.message));
    result.errors++;
  }
  return result;
}
function scheduleRtkRawOutputPurge(opts = {}) {
  setImmediate(() => {
    void purgeRtkRawOutput(opts).catch(() => {
    });
  });
}
export {
  isLikelyFailureOutput,
  listRtkCommandSamples,
  maybePersistRtkRawOutput,
  purgeRtkRawOutput,
  readRtkRawOutput,
  redactRtkRawOutput,
  resetRtkRawOutputPurgeThrottle,
  scheduleRtkRawOutputPurge
};
