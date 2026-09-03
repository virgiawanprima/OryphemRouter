const STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  "i",
  "we",
  "you",
  "he",
  "she",
  "it",
  "they",
  "me",
  "us",
  "him",
  "her",
  "them",
  "my",
  "our",
  "your",
  "his",
  "its",
  "their",
  "this",
  "that",
  "these",
  "those",
  "and",
  "but",
  "or",
  "nor",
  "for",
  "yet",
  "so",
  "as",
  "at",
  "by",
  "in",
  "of",
  "on",
  "to",
  "up",
  "via",
  "with",
  "from",
  "into",
  "onto",
  "upon",
  "about",
  "just",
  "very",
  "really",
  "quite",
  "rather",
  "also",
  "too",
  "even",
  "still",
  "already",
  "always",
  "never",
  "often",
  "usually",
  "sometimes",
  "here",
  "there"
]);
const FORCE_PRESERVE_RE = /\d|https?:\/\/|[._\/\\]|Error:|Exception:|```/i;
function scoreToken(token) {
  if (FORCE_PRESERVE_RE.test(token)) return 1;
  const lower = token.toLowerCase();
  if (STOPWORDS.has(lower)) return 0.1;
  if (token.length <= 2) return 0.2;
  if (/^[A-Z]/.test(token)) return 0.8;
  if (token.length >= 6) return 0.7;
  return 0.5;
}
function pruneByScore(text, keepRate = 0.5, minScore = 0.3) {
  if (!text || keepRate >= 1) return text;
  const tokens = text.split(/(\s+)/);
  const wordTokens = tokens.filter((t) => !/^\s+$/.test(t));
  const targetKeep = Math.ceil(wordTokens.length * keepRate);
  const scored = wordTokens.map((t, i) => ({ t, i, score: scoreToken(t) }));
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const toPrune = /* @__PURE__ */ new Set();
  let pruned = 0;
  for (const { i, score } of sorted) {
    if (pruned >= wordTokens.length - targetKeep) break;
    if (score < minScore) {
      toPrune.add(i);
      pruned++;
    }
  }
  let wordIdx = 0;
  return tokens.map((t) => {
    if (/^\s+$/.test(t)) return t;
    const keep = !toPrune.has(wordIdx);
    wordIdx++;
    return keep ? t : "";
  }).join("").replace(/\s{2,}/g, " ").trim();
}
export {
  FORCE_PRESERVE_RE,
  STOPWORDS,
  pruneByScore,
  scoreToken
};
