import { createRequire } from "node:module";
import { log as engineLog } from "../../../../utils/log.js";
let typeScriptModule;
let warnedMissingTypeScript = false;
let loadTypeScriptModule = defaultLoadTypeScriptModule;
function defaultLoadTypeScriptModule() {
  try {
    const requireFromHere = createRequire(import.meta.url);
    return requireFromHere("typescript");
  } catch {
    return null;
  }
}
function resolveTypeScript() {
  if (typeScriptModule === void 0) {
    typeScriptModule = loadTypeScriptModule();
    if (!typeScriptModule && !warnedMissingTypeScript) {
      warnedMissingTypeScript = true;
      engineLog.warn(
        "RTK",
        "[compression/rtk] optional dependency 'typescript' is not installed; skipping AST-based code-comment stripping (compression still works). Install 'typescript' to re-enable it."
      );
    }
  }
  return typeScriptModule;
}
function __setTypeScriptModuleLoaderForTests(loader) {
  loadTypeScriptModule = loader ?? defaultLoadTypeScriptModule;
  typeScriptModule = void 0;
  warnedMissingTypeScript = false;
}
const LANGUAGE_ALIASES = {
  js: "javascript",
  jsx: "javascript",
  javascript: "javascript",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  go: "go",
  rb: "ruby",
  ruby: "ruby",
  java: "java"
};
function normalizeCodeLanguage(language) {
  if (!language) return "unknown";
  return LANGUAGE_ALIASES[language.trim().toLowerCase()] ?? "unknown";
}
function detectCodeLanguage(text) {
  if (/\b(?:interface|type)\s+\w+\s*=|:\s*(?:string|number|boolean)\b/.test(text)) {
    return "typescript";
  }
  if (/\b(?:const|let|function|import|export)\b|=>/.test(text)) return "javascript";
  if (/\bdef\s+\w+\(|\bimport\s+\w+|print\(/.test(text)) return "python";
  if (/\bfn\s+\w+\(|\blet\s+mut\b|println!\(/.test(text)) return "rust";
  if (/\bfunc\s+\w+\(|package\s+\w+/.test(text)) return "go";
  if (/\bclass\s+\w+|System\.out\.println/.test(text)) return "java";
  if (/\bdef\s+\w+|puts\s+|end\s*$/.test(text)) return "ruby";
  return "unknown";
}
function stripJsTsComments(text, preserveDocstrings) {
  const ts = resolveTypeScript();
  if (!ts) return text;
  const source = ts.createSourceFile(
    "snippet.tsx",
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */
    true,
    ts.ScriptKind.TSX
  );
  let hasJsx = false;
  const detectJsx = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      hasJsx = true;
      return;
    }
    if (!hasJsx) ts.forEachChild(node, detectJsx);
  };
  detectJsx(source);
  if (hasJsx) return text;
  const ranges = /* @__PURE__ */ new Map();
  const collect = (node) => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
      ranges.set(range.pos, range);
    }
    for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) {
      ranges.set(range.pos, range);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  if (ranges.size === 0) return text;
  let result = text;
  for (const range of [...ranges.values()].sort((a, b) => b.pos - a.pos)) {
    if (preserveDocstrings && text.startsWith("/**", range.pos)) continue;
    result = result.slice(0, range.pos) + result.slice(range.end);
  }
  return result;
}
function stripCode(text, language = "unknown", options = {}) {
  const resolvedLanguage = language === "unknown" ? detectCodeLanguage(text) : language;
  const opts = {
    // Opt-in (default false): historically this flag was read but never applied,
    // so the effective behaviour was "preserve". Keeping the default at preserve
    // avoids a silent production change; callers opt in with removeComments:true.
    removeComments: options.removeComments === true,
    removeEmptyLines: options.removeEmptyLines !== false,
    collapseWhitespace: options.collapseWhitespace !== false,
    preserveDocstrings: options.preserveDocstrings === true
  };
  const originalLines = text.split(/\r?\n/).length;
  let result = text;
  if (opts.removeComments && (resolvedLanguage === "javascript" || resolvedLanguage === "typescript")) {
    result = stripJsTsComments(result, opts.preserveDocstrings);
  }
  if (opts.removeEmptyLines) result = result.replace(/^\s*$(?:\r?\n)?/gm, "");
  if (opts.collapseWhitespace) {
    result = result.split(/\r?\n/).map((line) => line.replace(/[ \t]+$/g, "")).join("\n");
  }
  result = result.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
  const strippedLines = Math.max(0, originalLines - (result ? result.split(/\r?\n/).length : 0));
  return { text: result, strippedLines, language: resolvedLanguage };
}
export {
  __setTypeScriptModuleLoaderForTests,
  detectCodeLanguage,
  normalizeCodeLanguage,
  stripCode
};
