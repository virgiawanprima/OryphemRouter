const FREE_TIER_BUDGETS = {
  mistral: 1e9,
  "cloudflare-ai": 122e6,
  gemini: 6e7,
  doubao: 6e7,
  cerebras: 3e7,
  "api-airforce": 24e6,
  "ollama-cloud": 2e7,
  groq: 15e6,
  bluesminds: 72e5,
  sambanova: 6e6,
  "arcee-ai": 48e5,
  llm7: 43e5,
  bazaarlink: 36e5,
  openrouter: 12e5,
  cohere: 8e5,
  huggingchat: 5e5,
  morph: 4e5,
  huggingface: 2e5,
  kiro: 25e3
};
const FREE_TIER_TOS = {
  opencode: "avoid",
  "duckduckgo-web": "avoid",
  "felo-web": "avoid",
  agy: "avoid",
  kiro: "avoid",
  "amazon-q": "avoid",
  "muse-spark-web": "avoid",
  "t3-web": "avoid",
  "qwen-web": "avoid",
  modal: "avoid",
  nlpcloud: "avoid",
  blackbox: "avoid",
  completions: "avoid",
  fireworks: "avoid",
  "featherless-ai": "avoid",
  friendliai: "avoid",
  ai21: "avoid",
  iflytek: "avoid",
  coze: "avoid"
};
function billions(n) {
  return n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : Math.round(n / 1e6) + "M";
}
function computeFreeTierTotals(opts = {}) {
  const byProvider = Object.entries(FREE_TIER_BUDGETS).map(([id, monthlyTokens]) => ({
    id,
    monthlyTokens,
    tos: FREE_TIER_TOS[id] ?? "caution"
  })).filter((p) => !(opts.excludeTosAvoid && p.tos === "avoid")).sort((a, b) => b.monthlyTokens - a.monthlyTokens);
  const documentedMonthlyTokens = byProvider.reduce((s, p) => s + p.monthlyTokens, 0);
  return {
    documentedMonthlyTokens,
    providerCount: byProvider.length,
    byProvider,
    headline: `over ${billions(documentedMonthlyTokens)} documented free tokens/month across ${byProvider.length}+ providers`
  };
}
export {
  FREE_TIER_BUDGETS,
  FREE_TIER_TOS,
  computeFreeTierTotals
};
