function coerceToArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === "string") {
    if (v === "") return [];
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
const READ_MAX_LIMIT = 2e3;
function isValidPdfPagesArg(filePath, pages) {
  return typeof filePath === "string" && filePath.toLowerCase().endsWith(".pdf") && typeof pages === "string" && /^\d+(?:-\d+)?$/.test(pages);
}
function sanitizeReadArgs(args) {
  if (typeof args.limit === "string" && /^\d+$/.test(args.limit)) {
    args.limit = Number(args.limit);
  }
  if (typeof args.offset === "string" && /^-?\d+$/.test(args.offset)) {
    args.offset = Number(args.offset);
  }
  if (typeof args.limit === "number") {
    const limit = args.limit;
    if (limit > READ_MAX_LIMIT) args.limit = READ_MAX_LIMIT;
    if (limit < 1) delete args.limit;
  }
  if (typeof args.offset === "number" && args.offset < 0) args.offset = 0;
  if ("pages" in args && !isValidPdfPagesArg(args.file_path, args.pages)) {
    delete args.pages;
  }
}
const TOOL_SHIMS = {
  // Claude Code Read rejects bad params and retries — wasting tokens with non-Anthropic
  // models that emit oversized limits, negative offsets, stringified numbers, or stray
  // `pages` on non-PDF files. Buffer and emit one cleaned JSON delta so the client never
  // sees the bad fields. See `sanitizeReadArgs` for the per-field rules.
  Read: (input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
    const patched = { ...input };
    sanitizeReadArgs(patched);
    return patched;
  },
  submit_pr_review: (input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
    const patched = { ...input };
    for (const key of ["functionalChanges", "findings"]) {
      patched[key] = coerceToArray(patched[key]);
    }
    return patched;
  }
};
function resolveToolCallShim(name) {
  if (typeof name !== "string" || !name) return void 0;
  if (Object.prototype.hasOwnProperty.call(TOOL_SHIMS, name)) return TOOL_SHIMS[name];
  const lower = name.toLowerCase();
  for (const [key, fn] of Object.entries(TOOL_SHIMS)) {
    if (key.toLowerCase() === lower) return fn;
  }
  return void 0;
}
function hasToolCallShim(name) {
  return Boolean(resolveToolCallShim(name));
}
function applyToolCallShimToBuffer(name, raw) {
  const shim = resolveToolCallShim(name);
  if (!shim) return raw;
  let parsed;
  try {
    parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  const patched = shim(parsed);
  return JSON.stringify(patched);
}
const __test = { coerceToArray, TOOL_SHIMS };
export {
  __test,
  applyToolCallShimToBuffer,
  hasToolCallShim
};
