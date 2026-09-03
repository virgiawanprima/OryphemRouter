const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const SHELL_PROMPT_RE = /\$\s/;
const JSON_PREFIX_RE = /^\s*[{[]/;
const COMPRESSED_MARKER_RE = /^\[COMPRESSED:/;
function isCodeLikeLine(rawLine) {
  const line = rawLine.trimStart();
  return line.startsWith("import ") || line.startsWith("export ") || line.startsWith("function ") || line.startsWith("class ") || line.startsWith("const ") || line.startsWith("let ") || line.startsWith("var ") || line.startsWith("return ") || line.startsWith("if(") || line.startsWith("if (") || line.startsWith("for(") || line.startsWith("for (") || line.startsWith("while(") || line.startsWith("while (");
}
function parseGrepLinePath(line) {
  const firstColon = line.indexOf(":");
  if (firstColon <= 0) return null;
  const secondColon = line.indexOf(":", firstColon + 1);
  if (secondColon === -1) return null;
  const lineNumber = line.slice(firstColon + 1, secondColon);
  if (!lineNumber || ![...lineNumber].every((char) => char >= "0" && char <= "9")) {
    return null;
  }
  const filePath = line.slice(0, firstColon);
  if (!filePath || /\s/.test(filePath)) return null;
  return filePath;
}
function hasErrorLikeOutput(content) {
  const lower = content.toLowerCase();
  return lower.includes("error:") || lower.includes("error ") || lower.includes("[error]") || lower.includes("exception:") || lower.includes("exception ") || lower.includes("[exception]") || lower.includes("traceback");
}
function compressFileContent(content) {
  const lines = content.split("\n");
  if (lines.length < 3) return null;
  if (!lines.some(isCodeLikeLine)) return null;
  const keep = 20;
  const tail = 5;
  if (lines.length <= keep + tail) return content;
  const head = lines.slice(0, keep).join("\n");
  const tailLines = lines.slice(-tail).join("\n");
  const elided = lines.length - keep - tail;
  return `${head}
\u2026 [${elided} lines elided] \u2026
${tailLines}`;
}
function compressGrepSearch(content) {
  const lines = content.split("\n");
  const grepLines = lines.filter((line) => parseGrepLinePath(line) !== null);
  if (grepLines.length === 0) return null;
  const paths = /* @__PURE__ */ new Set();
  for (const line of grepLines) {
    const filePath = parseGrepLinePath(line);
    if (filePath) paths.add(filePath);
  }
  const top30 = grepLines.slice(0, 30);
  const remaining = grepLines.length - top30.length;
  let result = top30.join("\n");
  if (remaining > 0) {
    result += `
\u2026 [${remaining} more matches]`;
  }
  result += `
Files: ${[...paths].join(", ")}`;
  return result;
}
function compressShellOutput(content) {
  const hasAnsi = ANSI_RE.test(content);
  const hasPrompt = SHELL_PROMPT_RE.test(content);
  if (!hasAnsi && !hasPrompt) return null;
  let cleaned = content.replace(ANSI_RE, "");
  const lines = cleaned.split("\n");
  const last50 = lines.slice(-50);
  const deduped = [];
  for (const line of last50) {
    if (deduped.length === 0 || line !== deduped[deduped.length - 1]) {
      deduped.push(line);
    }
  }
  return deduped.join("\n");
}
function compressJson(content) {
  if (content.length <= 2e3) return null;
  if (!JSON_PREFIX_RE.test(content)) return null;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    const arr = parsed;
    if (arr.length <= 7) return content;
    const head = arr.slice(0, 5);
    const tail = arr.slice(-2);
    return JSON.stringify({ type: "array", total: arr.length, first5: head, last2: tail }, null, 2);
  }
  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed;
    const keys = Object.keys(obj);
    const summary = {};
    for (const key of keys.slice(0, 20)) {
      const val = obj[key];
      if (typeof val === "object" && val !== null) {
        summary[key] = `{\u2026${Object.keys(val).length} keys}`;
      } else {
        summary[key] = val;
      }
    }
    if (keys.length > 20) {
      summary[`_remaining_${keys.length - 20}_keys`] = true;
    }
    return JSON.stringify(summary, null, 2);
  }
  return null;
}
function compressErrorMessage(content) {
  if (!hasErrorLikeOutput(content)) return null;
  const lines = content.split("\n");
  const errorLine = lines[0] || "";
  const stackLines = lines.slice(1);
  const head = stackLines.slice(0, 10);
  const tail = stackLines.length > 10 ? stackLines.slice(-3) : [];
  const middle = stackLines.length > 13 ? [`\u2026 [${stackLines.length - 13} frames elided] \u2026`] : [];
  const result = [errorLine, ...head, ...middle, ...tail].join("\n");
  return result;
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function isAnthropicToolResultBlock(value) {
  return !!value && typeof value === "object" && value.type === "tool_result";
}
function compressAnthropicToolResultBlock(block, opts) {
  const content = block.content;
  if (typeof content === "string") {
    if (!content || COMPRESSED_MARKER_RE.test(content)) return { block, saved: 0 };
    const result = compressToolResult(content, opts);
    if (result.strategy === "none" || result.saved <= 0) return { block, saved: 0 };
    return { block: { ...block, content: result.compressed }, saved: result.saved };
  }
  if (Array.isArray(content)) {
    let saved = 0;
    let changed = false;
    const nextContent = content.map((part) => {
      if (!part || typeof part !== "object" || part.type !== "text" || typeof part.text !== "string") {
        return part;
      }
      const text = part.text;
      if (!text || COMPRESSED_MARKER_RE.test(text)) return part;
      const result = compressToolResult(text, opts);
      if (result.strategy === "none" || result.saved <= 0) return part;
      saved += result.saved;
      changed = true;
      return { ...part, text: result.compressed };
    });
    if (!changed) return { block, saved: 0 };
    return { block: { ...block, content: nextContent }, saved };
  }
  return { block, saved: 0 };
}
function compressToolResult(content, opts) {
  if (opts.fileContent) {
    const result = compressFileContent(content);
    if (result !== null) {
      return {
        compressed: result,
        strategy: "fileContent",
        saved: estimateTokens(content) - estimateTokens(result)
      };
    }
  }
  if (opts.grepSearch) {
    const result = compressGrepSearch(content);
    if (result !== null) {
      return {
        compressed: result,
        strategy: "grepSearch",
        saved: estimateTokens(content) - estimateTokens(result)
      };
    }
  }
  if (opts.shellOutput) {
    const result = compressShellOutput(content);
    if (result !== null) {
      return {
        compressed: result,
        strategy: "shellOutput",
        saved: estimateTokens(content) - estimateTokens(result)
      };
    }
  }
  if (opts.json) {
    const result = compressJson(content);
    if (result !== null) {
      return {
        compressed: result,
        strategy: "json",
        saved: estimateTokens(content) - estimateTokens(result)
      };
    }
  }
  if (opts.errorMessage) {
    const result = compressErrorMessage(content);
    if (result !== null) {
      return {
        compressed: result,
        strategy: "errorMessage",
        saved: estimateTokens(content) - estimateTokens(result)
      };
    }
  }
  return { compressed: content, strategy: "none", saved: 0 };
}
export {
  compressAnthropicToolResultBlock,
  compressToolResult,
  isAnthropicToolResultBlock,
  isCodeLikeLine
};
