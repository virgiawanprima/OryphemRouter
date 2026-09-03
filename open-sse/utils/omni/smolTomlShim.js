// ADAPTATION for OryphemRouter.
// OmniRoute's `compression/engines/rtk/tomlCompatibility.ts` uses the `smol-toml` npm
// package to parse RTK TOML filter files. That package is not installed here. This shim
// implements a minimal TOML parser for the flat key = value tables that RTK filter files
// use, with graceful fallback to an empty object.

function parseScalar(raw) {
  const v = raw.trim();
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1);
  if (v === "true") return true;
  if (v === "false") return false;
  const num = Number(v);
  if (v !== "" && Number.isFinite(num)) return num;
  if (/^\[.*\]$/.test(v)) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((x) => parseScalar(x));
  }
  return v;
}

/** Minimal TOML parser: section headers `[table]` + `key = value` pairs. */
export function parse(input) {
  const result = {};
  let current = result;
  for (const rawLine of String(input ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sectionMatch = /^\[(.+)\]$/.exec(line);
    if (sectionMatch) {
      const path = sectionMatch[1].trim().split(".");
      current = result;
      for (const key of path) {
        if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
          current[key] = {};
        }
        current = current[key];
      }
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = parseScalar(line.slice(eq + 1));
    current[key] = value;
  }
  return result;
}

export function stringify(obj) {
  const lines = [];
  const walk = (prefix, value) => {
    for (const [k, v] of Object.entries(value ?? {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        lines.push(`[${key}]`);
        walk(key, v);
      } else if (Array.isArray(v)) {
        lines.push(`${key} = [${v.map((x) => JSON.stringify(x)).join(", ")}]`);
      } else if (typeof v === "string") {
        lines.push(`${key} = ${JSON.stringify(v)}`);
      } else {
        lines.push(`${key} = ${String(v)}`);
      }
    }
  };
  walk("", obj);
  return lines.join("\n");
}
