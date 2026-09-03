const ZWJ = "\u200D";
const DEFAULT_SENSITIVE_WORDS = [
  "opencode",
  "open-code",
  "cline",
  "roo-cline",
  "roo_cline",
  "cursor",
  "windsurf",
  "aider",
  "continue.dev",
  "copilot",
  "avante",
  "codecompanion"
];
let sensitiveWords = [...DEFAULT_SENSITIVE_WORDS];
function setSensitiveWords(words) {
  sensitiveWords = words.length > 0 ? words : [...DEFAULT_SENSITIVE_WORDS];
}
function getSensitiveWords() {
  return [...sensitiveWords];
}
function obfuscateWord(word) {
  if (word.length <= 1) return word;
  return word[0] + ZWJ + word.slice(1);
}
const _obfuscationRegexCache = /* @__PURE__ */ new Map();
function getObfuscationRegex(word) {
  let regex = _obfuscationRegexCache.get(word);
  if (!regex) {
    if (_obfuscationRegexCache.size > 2e3) _obfuscationRegexCache.clear();
    regex = new RegExp(escapeRegex(word), "gi");
    _obfuscationRegexCache.set(word, regex);
  }
  return regex;
}
function obfuscateSensitiveWords(text) {
  if (!text || sensitiveWords.length === 0) return text;
  let result = text;
  for (const word of sensitiveWords) {
    if (!word) continue;
    const regex = getObfuscationRegex(word);
    result = result.replace(regex, (match) => obfuscateWord(match));
  }
  return result;
}
function obfuscateInBody(body) {
  if (typeof body.system === "string") {
    body.system = obfuscateSensitiveWords(body.system);
  } else if (Array.isArray(body.system)) {
    for (const block of body.system) {
      if (typeof block.text === "string") {
        block.text = obfuscateSensitiveWords(block.text);
      }
    }
  }
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      const content = msg.content;
      if (typeof content === "string") {
        msg.content = obfuscateSensitiveWords(content);
      } else if (Array.isArray(content)) {
        const blocks = content;
        const hasSignedThinking = blocks.some(
          (block) => block?.type === "thinking" || block?.type === "redacted_thinking"
        );
        if (!hasSignedThinking) {
          for (const block of blocks) {
            if (typeof block.text === "string") {
              block.text = obfuscateSensitiveWords(block.text);
            }
          }
        }
      }
    }
  }
  const tools = body.tools;
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (typeof tool.description === "string") {
        tool.description = obfuscateSensitiveWords(tool.description);
      }
      const fn = tool.function;
      if (fn && typeof fn.description === "string") {
        fn.description = obfuscateSensitiveWords(fn.description);
      }
    }
  }
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export {
  getSensitiveWords,
  obfuscateInBody,
  obfuscateSensitiveWords,
  setSensitiveWords
};
