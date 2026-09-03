const SENTINEL_PREFIX = "\0OMNI_CAVEMAN";
function randomSentinelSeed() {
  const bytes = new Uint8Array(8);
  const cryptoLike = globalThis.crypto;
  if (cryptoLike?.getRandomValues) {
    cryptoLike.getRandomValues(bytes);
    return `r${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
  return `r${Math.random().toString(36).slice(2)}`;
}
function ensureGlobal(pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}
function compileUserPatterns(patterns) {
  if (!patterns?.length) return [];
  const compiled = [];
  for (const pattern of patterns) {
    try {
      compiled.push({
        pattern: typeof pattern === "string" ? new RegExp(pattern, "g") : ensureGlobal(pattern),
        kind: "custom"
      });
    } catch {
    }
  }
  return compiled;
}
function replacePattern(text, pattern, kind, addBlock) {
  pattern.lastIndex = 0;
  return text.replace(pattern, (match) => {
    if (!match) return match;
    if (match.includes(SENTINEL_PREFIX)) return match;
    return addBlock(match, kind);
  });
}
function findFencedCodeBlocks(text) {
  const blocks = [];
  extractFencedCodeBlocks(text, (content) => {
    blocks.push(content);
    return content;
  });
  return blocks;
}
function extractPreservedBlocks(text, options = {}) {
  const blocks = [];
  const seed = randomSentinelSeed();
  let counter = 0;
  const addBlock = (content, kind) => {
    const placeholder = `${SENTINEL_PREFIX}_${seed}_${counter}\0`;
    blocks.push({ placeholder, content, kind });
    counter++;
    return placeholder;
  };
  let result = text;
  result = extractFrontmatter(result, addBlock);
  result = extractFencedCodeBlocks(result, (content) => addBlock(content, "fenced_code"));
  const builtIns = [
    { pattern: /\$\$[\s\S]*?\$\$/g, kind: "math_block" },
    { pattern: /\\\[[\s\S]*?\\\]/g, kind: "math_block" },
    // #4795: exclude `\` from the catch-all branch so a backslash is only ever
    // consumed by the escape branch `\\.`. The previous `[^$\n]` overlapped with
    // `\\.`, making a run of consecutive backslashes (e.g. unmatched `$` + a
    // Windows path) exponentially ambiguous → catastrophic backtracking (ReDoS).
    {
      pattern: /(?<!\$)\$(?![\s$\d])(?:\\.|[^$\n\\]){1,160}?(?<!\s)\$(?!\$)/g,
      kind: "math_inline"
    },
    { pattern: /\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}/g, kind: "latex_block" },
    { pattern: /^#{1,6}\s+.+$/gm, kind: "markdown_heading" },
    { pattern: /^\s*\|.*\|\s*$/gm, kind: "markdown_table" },
    { pattern: /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, kind: "markdown_table" },
    { pattern: /^\s*#(?:set|show|let|import|include)\b.+$/gm, kind: "typst_directive" },
    { pattern: /`[^`\n]+`/g, kind: "inline_code" },
    { pattern: /\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)/g, kind: "markdown_link" },
    { pattern: /\bhttps?:\/\/[^\s)\]"'>]+/gi, kind: "url" },
    { pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, kind: "const_case" },
    { pattern: /\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*\b/g, kind: "env_var" },
    { pattern: /\$[A-Z_][A-Z0-9_]*\b/g, kind: "env_var" },
    { pattern: /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, kind: "version" },
    { pattern: /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\(\)?/g, kind: "dotted_identifier" },
    { pattern: /\b[A-Za-z_$][\w$]*\s*\([^()\n]*\)/g, kind: "function_call" },
    {
      pattern: /(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)/g,
      kind: "file_path"
    },
    {
      pattern: /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]+/g,
      kind: "error_message"
    }
  ];
  for (const { pattern, kind } of [...builtIns, ...compileUserPatterns(options.preservePatterns)]) {
    result = replacePattern(result, ensureGlobal(pattern), kind, addBlock);
  }
  return { text: result, blocks };
}
function preserveSpans(text, spans) {
  if (!spans.length) return { text, blocks: [] };
  const seed = randomSentinelSeed();
  const blocks = [];
  let result = "";
  let cursor = 0;
  let counter = 0;
  for (const span of spans) {
    if (span.start < cursor || span.end > text.length || span.start >= span.end) continue;
    const placeholder = `${SENTINEL_PREFIX}_${seed}_${counter}\0`;
    blocks.push({ placeholder, content: text.slice(span.start, span.end), kind: span.kind });
    result += text.slice(cursor, span.start) + placeholder;
    cursor = span.end;
    counter++;
  }
  result += text.slice(cursor);
  return { text: result, blocks };
}
function extractFrontmatter(text, addBlock) {
  if (!text.startsWith("---\n")) return text;
  const close = text.indexOf("\n---", 4);
  if (close === -1) return text;
  const closeEnd = text.indexOf("\n", close + 4);
  const end = closeEnd === -1 ? text.length : closeEnd + 1;
  return `${addBlock(text.slice(0, end), "frontmatter")}${text.slice(end)}`;
}
function extractFencedCodeBlocks(text, addBlock) {
  const lines = text.match(/[^\n]*(?:\n|$)/g) ?? [text];
  let output = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === "" && i === lines.length - 1) break;
    const opening = line.match(/^([ \t]{0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/);
    if (!opening) {
      output += line;
      i++;
      continue;
    }
    const fence = opening[2];
    const fenceChar = fence[0];
    const minLen = fence.length;
    let block = line;
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      const candidate = lines[j];
      block += candidate;
      const closeMatch = candidate.match(/^([ \t]{0,3})(`{3,}|~{3,})\s*(?:\n|$)/);
      if (closeMatch && closeMatch[2][0] === fenceChar && closeMatch[2].length >= minLen) {
        closed = true;
        break;
      }
      j++;
    }
    if (!closed) {
      output += line;
      i++;
      continue;
    }
    output += addBlock(block);
    i = j + 1;
  }
  return output;
}
function restorePreservedBlocks(text, blocks) {
  let result = text;
  for (const block of blocks) {
    result = result.split(block.placeholder).join(block.content);
  }
  return result;
}
function shouldPreserve(text, preservePatterns) {
  return preservePatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
export {
  extractPreservedBlocks,
  findFencedCodeBlocks,
  preserveSpans,
  restorePreservedBlocks,
  shouldPreserve
};
