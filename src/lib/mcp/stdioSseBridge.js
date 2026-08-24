// Inline stdio<->SSE bridge for MCP. Spawns one child per plugin on demand,
// broadcasts JSON-RPC frames over SSE, accepts client messages via HTTP POST.

const { spawn } = require("child_process");
const crypto = require("crypto");
const { LOCAL_STDIO_PLUGINS } = require("@/shared/constants/coworkPlugins");

const G_KEY = "__oryphemrouterMcpBridges";
const MAX_TEXT_CHARS = 50000;
const COLLAPSE_THRESHOLD = 30;
const COLLAPSE_KEEP_HEAD = 10;
const COLLAPSE_KEEP_TAIL = 5;

// Drop noise nodes, collapse repeated siblings, hard-truncate. Preserve [ref=eXX].
function smartFilterText(text) {
  if (typeof text !== "string" || text.length < 2000) return text;
  let out = text;
  out = out.replace(/^\s*-\s*generic:?\s*$/gm, "");
  out = out.replace(/^\s*-\s*text:\s*""\s*$/gm, "");
  out = collapseRepeated(out);
  if (out.length > MAX_TEXT_CHARS) {
    const head = out.slice(0, MAX_TEXT_CHARS - 300);
    out = `${head}\n\n... [truncated ${text.length - head.length} chars by oryphemrouter bridge. Page is large; ask user to scroll/navigate to a specific section, or click an element with the refs shown above]`;
  }
  return out;
}

// Group consecutive lines sharing the same leading indent + role prefix; collapse if >= COLLAPSE_THRESHOLD.
function collapseRepeated(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(\s*)-\s*([a-zA-Z]+)\b/);
    if (!m) { out.push(line); i++; continue; }
    const indent = m[1];
    const role = m[2];
    let j = i;
    while (j < lines.length) {
      const ln = lines[j];
      const mm = ln.match(/^(\s*)-\s*([a-zA-Z]+)\b/);
      if (mm && mm[1] === indent && mm[2] === role) { j++; continue; }
      if (ln.startsWith(`${indent} `) || ln.startsWith(`${indent}\t`)) { j++; continue; }
      break;
    }
    const groupLen = j - i;
    if (groupLen >= COLLAPSE_THRESHOLD) {
      const headEnd = findNthSiblingEnd(lines, i, indent, role, COLLAPSE_KEEP_HEAD);
      const tailStart = findLastNSiblingStart(lines, j, indent, role, COLLAPSE_KEEP_TAIL);
      for (let k = i; k < headEnd; k++) out.push(lines[k]);
      out.push(`${indent}... [${groupLen - COLLAPSE_KEEP_HEAD - COLLAPSE_KEEP_TAIL} similar "${role}" items omitted by oryphemrouter bridge]`);
      for (let k = tailStart; k < j; k++) out.push(lines[k]);
    } else {
      for (let k = i; k < j; k++) out.push(lines[k]);
    }
    i = j;
  }
  return out.join("\n");
}

function findNthSiblingEnd(lines, start, indent, role, n) {
  let count = 0;
  for (let k = start; k < lines.length; k++) {
    const mm = lines[k].match(/^(\s*)-\s*([a-zA-Z]+)\b/);
    if (mm && mm[1] === indent && mm[2] === role) {
      count++;
      if (count > n) return k;
    }
  }
  return lines.length;
}

function findLastNSiblingStart(lines, end, indent, role, n) {
  const positions = [];
  for (let k = 0; k < end; k++) {
    const mm = lines[k].match(/^(\s*)-\s*([a-zA-Z]+)\b/);
    if (mm && mm[1] === indent && mm[2] === role) positions.push(k);
  }
  return positions.length > n ? positions[positions.length - n] : end;
}

// Apply filter to JSON-RPC tool/result content text blocks only.
function filterFrame(line) {
  try {
    const msg = JSON.parse(line);
    const content = msg?.result?.content;
    if (!Array.isArray(content)) return line;
    let mutated = false;
    for (const item of content) {
      if (item?.type === "text" && typeof item.text === "string") {
        const filtered = smartFilterText(item.text);
        if (filtered !== item.text) { item.text = filtered; mutated = true; }
      }
    }
    return mutated ? JSON.stringify(msg) : line;
  } catch { return line; }
}
const getStore = () => {
  if (!globalThis[G_KEY]) globalThis[G_KEY] = new Map();
  return globalThis[G_KEY];
};

// Only preset stdio plugins may spawn. No user-defined commands (RCE prevention).
function findPlugin(name) {
  return LOCAL_STDIO_PLUGINS.find((p) => p.name === name) || null;
}

function getOrSpawn(name) {
  const store = getStore();
  let entry = store.get(name);
  if (entry?.proc && !entry.proc.killed && entry.proc.exitCode === null) return entry;

  const plugin = findPlugin(name);
  if (!plugin) throw new Error(`Unknown local plugin: ${name}`);

  const proc = spawn(plugin.command, plugin.args, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
  entry = { proc, sessions: new Map(), buffer: "" };
  store.set(name, entry);

  // Parse newline-delimited JSON-RPC from child stdout, broadcast to all sessions.
  proc.stdout.on("data", (chunk) => {
    entry.buffer += chunk.toString("utf8");
    // Cap buffer to prevent unbounded growth from a misbehaving child that
    // emits output without newlines. Drop the oldest data beyond 1 MB.
    if (entry.buffer.length > 1_048_576) {
      entry.buffer = entry.buffer.slice(-524_288);
    }
    let idx;
    while ((idx = entry.buffer.indexOf("\n")) >= 0) {
      const raw = entry.buffer.slice(0, idx).trim();
      entry.buffer = entry.buffer.slice(idx + 1);
      if (!raw) continue;
      const line = filterFrame(raw);
      for (const [sid, send] of entry.sessions) {
        try { send(`event: message\ndata: ${line}\n\n`);
              // H5: Refresh session timestamp on data activity to prevent
              // TTL-based reaping of active sessions.
              entry.sessionTs?.set(sid, Date.now());
        } catch { /* ignore broken pipe */ }
      }
    }
  });

  proc.stderr.on("data", (d) => console.log(`[mcp:${name}]`, d.toString().trim()));
  proc.on("exit", (code) => {
    console.log(`[mcp:${name}] exited`, code);
    store.delete(name);
  });
  // M01: Handle spawn errors (ENOENT, permission denied) — prevents
  // uncaught exception crash when the plugin binary is missing.
  proc.on("error", (err) => {
    console.error(`[mcp:${name}] spawn error:`, err.message);
    store.delete(name);
  });

  return entry;
}

function registerSession(name, sendFn) {
  const entry = getOrSpawn(name);
  const sid = crypto.randomUUID();
  entry.sessions.set(sid, sendFn);
  if (!entry.sessionTs) entry.sessionTs = new Map();
  entry.sessionTs.set(sid, Date.now());
  startSweep();
  return sid;
}

function unregisterSession(name, sid) {
  const entry = getStore().get(name);
  if (!entry) return;
  entry.sessions.delete(sid);
  entry.sessionTs?.delete(sid);
  // No sessions left → kill child to avoid idle orphan process leak.
  if (entry.sessions.size === 0) {
    try { entry.proc.kill(); } catch { /* ignore */ }
    getStore().delete(name);
  }
}

// A dropped SSE socket can die without `abort`/`cancel` firing (silent TCP
// reset), which would otherwise leave a child process + session entry alive
// forever. Sweep sessions idle longer than the TTL and reap empty bridges.
const SESSION_TTL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

function startSweep() {
  if (globalThis[`${G_KEY}_sweep`]) return;
  const timer = setInterval(() => {
    const store = getStore();
    const now = Date.now();
    for (const [name, entry] of store) {
      const ts = entry.sessionTs;
      if (ts) {
        for (const [sid, t] of ts) {
          if (now - t > SESSION_TTL_MS) {
            ts.delete(sid);
            entry.sessions.delete(sid);
          }
        }
      }
      if (entry.sessions.size === 0) {
        try { entry.proc.kill(); } catch { /* ignore */ }
        store.delete(name);
      }
    }
    // Stop sweeping when no bridges remain.
    if (store.size === 0 && globalThis[`${G_KEY}_sweep`]) {
      clearInterval(globalThis[`${G_KEY}_sweep`]);
      delete globalThis[`${G_KEY}_sweep`];
    }
  }, SWEEP_INTERVAL_MS);
  if (timer.unref) timer.unref();
  globalThis[`${G_KEY}_sweep`] = timer;
}

// Kill all spawned MCP children — called on app shutdown to prevent orphans.
function killAllBridges() {
  const store = getStore();
  for (const [name, entry] of store) {
    try { entry.proc.kill(); } catch { /* ignore */ }
    store.delete(name);
  }
}

function sendToChild(name, jsonRpc) {
  const entry = getStore().get(name);
  if (!entry?.proc?.stdin?.writable) throw new Error(`Bridge not running: ${name}`);
  entry.proc.stdin.write(`${JSON.stringify(jsonRpc)}\n`);
}

function isRunning(name) {
  const entry = getStore().get(name);
  return !!(entry?.proc && !entry.proc.killed && entry.proc.exitCode === null);
}

module.exports = { getOrSpawn, registerSession, unregisterSession, sendToChild, isRunning, findPlugin, killAllBridges };
