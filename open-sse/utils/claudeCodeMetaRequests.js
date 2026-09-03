const TWO_WORD_TOOLS = /* @__PURE__ */ new Set([
  "git",
  "npm",
  "docker",
  "kubectl",
  "cargo",
  "go",
  "pip",
  "yarn",
  "pnpm",
  "bun"
]);
const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
const INJECTION_RE = /[;|&`]|\$\(/;
function tokenize(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
function extractCommandPrefix(command) {
  if (typeof command !== "string" || !command.trim()) return "";
  if (INJECTION_RE.test(command) || command.includes("\n")) {
    return "command_injection_detected";
  }
  let tokens = tokenize(command);
  while (tokens.length && ENV_ASSIGNMENT_RE.test(tokens[0])) tokens = tokens.slice(1);
  if (!tokens.length) return "";
  const head = tokens[0];
  if (TWO_WORD_TOOLS.has(head) && tokens.length > 1 && !tokens[1].startsWith("-")) {
    return `${head} ${tokens[1]}`;
  }
  return head;
}
const READ_COMMANDS = /* @__PURE__ */ new Set(["cat", "head", "tail", "less", "more", "bat", "type"]);
const LISTING_COMMANDS = /* @__PURE__ */ new Set(["ls", "dir", "find", "tree"]);
const GREP_ARG_FLAGS = /* @__PURE__ */ new Set(["-e", "-f", "-m", "-A", "-B", "-C"]);
function extractFilepathsFromCommand(command, _output = "") {
  if (typeof command !== "string" || !command.trim()) return [];
  const tokens = tokenize(command);
  if (!tokens.length) return [];
  const head = tokens[0];
  if (LISTING_COMMANDS.has(head)) return [];
  if (head === "grep") {
    const files = [];
    let patternConsumed = false;
    for (let i = 1; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.startsWith("-")) {
        if (GREP_ARG_FLAGS.has(tok)) {
          i++;
          if (tok === "-e" || tok === "-f") patternConsumed = true;
        }
        continue;
      }
      if (!patternConsumed) {
        patternConsumed = true;
        continue;
      }
      files.push(tok);
    }
    return files;
  }
  if (READ_COMMANDS.has(head)) {
    return tokens.slice(1).filter((t) => !t.startsWith("-"));
  }
  return [];
}
export {
  extractCommandPrefix,
  extractFilepathsFromCommand
};
