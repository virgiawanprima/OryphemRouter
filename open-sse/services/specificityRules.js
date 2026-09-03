function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function estimateMessageTokens(messages) {
  return messages.reduce((sum, msg) => {
    if (typeof msg.content === "string") return sum + estimateTokens(msg.content);
    if (Array.isArray(msg.content)) {
      return sum + msg.content.reduce(
        (s, part) => s + (typeof part?.text === "string" ? estimateTokens(part.text) : 0),
        0
      );
    }
    return sum;
  }, 0);
}
function detectCodeComplexity(input) {
  const allText = input.messages.map((m) => typeof m.content === "string" ? m.content : "").join("\n");
  const codeFenceMatches = allText.match(/```[\s\S]*?```/g);
  const codeBlockCount = codeFenceMatches ? codeFenceMatches.length : 0;
  const inlineCodeMatches = allText.match(/`[^`]+`/g);
  const inlineCodeCount = inlineCodeMatches ? inlineCodeMatches.length : 0;
  const langIndicators = [
    /function\s+\w+\s*\(/gi,
    /const\s+\w+\s*=/gi,
    /import\s+.*from/gi,
    /class\s+\w+/gi,
    /interface\s+\w+/gi,
    /async\s+function/gi,
    /def\s+\w+\s*\(/gi,
    /SELECT\s+.*FROM/gi,
    /\$\{.*\}/g
  ];
  const langMatches = langIndicators.reduce((sum, re) => {
    const matches = allText.match(re);
    return sum + (matches ? matches.length : 0);
  }, 0);
  const raw = codeBlockCount * 5 + inlineCodeCount * 0.5 + langMatches * 2;
  return Math.min(25, Math.round(raw));
}
function detectMathComplexity(input) {
  const allText = input.messages.map((m) => typeof m.content === "string" ? m.content : "").join("\n");
  const latexMatches = allText.match(/\$\$[\s\S]*?\$\$|\$[^$]+\$/g);
  const latexCount = latexMatches ? latexMatches.length : 0;
  const mathIndicators = [
    /[+\-*/^]=/g,
    /\b(sin|cos|tan|log|sqrt|sum|prod|int|lim)\b/gi,
    /\b\d+\s*[+\-*/]\s*\d+\s*=/g,
    /∑|∏|∫|√|∞|π/g,
    /\bf'(?:x)?\b/g,
    /\bdx\b/g
  ];
  const mathMatches = mathIndicators.reduce((sum, re) => {
    const matches = allText.match(re);
    return sum + (matches ? matches.length : 0);
  }, 0);
  const raw = latexCount * 4 + mathMatches * 1.5;
  return Math.min(20, Math.round(raw));
}
function detectReasoningDepth(input) {
  const allText = input.messages.map((m) => typeof m.content === "string" ? m.content : "").join("\n");
  const reasoningIndicators = [
    /\b(first|step\s*\d|secondly|finally|therefore|thus|consequently|because|since)\b/gi,
    /\b(let me think|let's reason|let's analyze|step by step|breaking this down)\b/gi,
    /\b(we need to|we must|we should|the approach is|the solution involves)\b/gi,
    /(?:\d+\.\s+)(?:\w+)/g,
    /\b(if\s+.+\s+then\s+|assuming\s+|suppose\s+|consider\s+that)\b/gi
  ];
  const reasonMatches = reasoningIndicators.reduce((sum, re) => {
    const matches = allText.match(re);
    return sum + (matches ? matches.length : 0);
  }, 0);
  const messageDepthBonus = Math.min(5, input.messages.length);
  const raw = reasonMatches * 2 + messageDepthBonus;
  return Math.min(20, Math.round(raw));
}
function detectContextSize(input) {
  const totalTokens = estimateMessageTokens(input.messages);
  if (totalTokens > 64e3) return 15;
  if (totalTokens > 32e3) return 12;
  if (totalTokens > 16e3) return 9;
  if (totalTokens > 8e3) return 6;
  if (totalTokens > 4e3) return 4;
  if (totalTokens > 1e3) return 2;
  return 0;
}
function detectToolCalling(input) {
  if (!input.tools || input.tools.length === 0) return 0;
  const toolCount = input.tools.length;
  if (toolCount > 20) return 10;
  if (toolCount > 10) return 8;
  if (toolCount > 5) return 6;
  if (toolCount > 2) return 4;
  return 2;
}
function detectDomainSpecificity(input) {
  const allText = input.messages.map((m) => typeof m.content === "string" ? m.content : "").join("\n");
  const domainTerms = {
    medical: [/\bdiagnosis\b/i, /\bsymptoms\b/i, /\btreatment\b/i, /\bpatient\b/i, /\bclinical\b/i],
    legal: [/\bpursuant\b/i, /\bstatute\b/i, /\bliability\b/i, /\bjurisdiction\b/i, /\bhereby\b/i],
    scientific: [/\bhypothesis\b/i, /\bmethodology\b/i, /\bempirical\b/i, /\bsignificant\b/i],
    financial: [/\bportfolio\b/i, /\bdividend\b/i, /\bamortization\b/i, /\barbitrage\b/i]
  };
  let maxDomainScore = 0;
  for (const [, terms] of Object.entries(domainTerms)) {
    const score = terms.reduce((sum, re) => {
      return sum + (re.test(allText) ? 2 : 0);
    }, 0);
    maxDomainScore = Math.max(maxDomainScore, score);
  }
  return Math.min(10, maxDomainScore);
}
function getSpecificityBreakdown(input) {
  return {
    codeComplexity: detectCodeComplexity(input),
    mathComplexity: detectMathComplexity(input),
    reasoningDepth: detectReasoningDepth(input),
    contextSize: detectContextSize(input),
    toolCalling: detectToolCalling(input),
    domainSpecificity: detectDomainSpecificity(input)
  };
}
function detectConversationDepth(input) {
  const userMessages = input.messages.filter(
    (m) => m.role === "user"
  ).length;
  const assistantMessages = input.messages.filter(
    (m) => m.role === "assistant"
  ).length;
  const totalTurns = userMessages + assistantMessages;
  if (totalTurns > 30) return 8;
  if (totalTurns > 20) return 6;
  if (totalTurns > 10) return 4;
  if (totalTurns > 5) return 2;
  return 0;
}
function detectFileReferences(input) {
  const allText = input.messages.map((m) => typeof m.content === "string" ? m.content : "").join("\n");
  const filePatterns = [
    /(?:\/[\w.-]+){2,}/g,
    /\b\w+:\d+:\d+\b/g,
    /\b(?:diff|patch|merge)\b/gi,
    /\b(?:README|CHANGELOG|TODO)\b/gi,
    /@@[\s+-]+\d+,\d+\s+@@/g
  ];
  const matches = filePatterns.reduce((sum, re) => {
    return sum + (allText.match(re)?.length || 0);
  }, 0);
  return Math.min(5, matches * 1);
}
function detectErrorContext(input) {
  const allText = input.messages.map((m) => typeof m.content === "string" ? m.content : "").join("\n");
  const errorPatterns = [
    /\b(?:Error|Exception|TypeError|ReferenceError|SyntaxError)\b/g,
    /\bat\s+[\w.]+\s+\([\w./]+:\d+:\d+\)/g,
    /\b(?:throw|catch|finally)\b/g,
    /\b(?:ERRO|FATAL|WARN)\b/g,
    /\b(?:failed|crashed|unexpected)\b/gi,
    /\bExit code \d+\b/g
  ];
  const matches = errorPatterns.reduce((sum, re) => {
    return sum + (allText.match(re)?.length || 0);
  }, 0);
  return Math.min(5, matches * 0.5);
}
function detectEnhancedContextSize(input) {
  const msgTokens = estimateMessageTokens(input.messages);
  const sysTokens = input.systemPrompt ? estimateTokens(input.systemPrompt) : 0;
  const toolTokens = input.tools ? input.tools.reduce(
    (sum, t) => sum + estimateTokens(
      JSON.stringify(
        t?.function || t
      )
    ),
    0
  ) : 0;
  const total = msgTokens + sysTokens + toolTokens;
  if (total > 1e5) return 15;
  if (total > 64e3) return 13;
  if (total > 32e3) return 10;
  if (total > 16e3) return 7;
  if (total > 8e3) return 5;
  if (total > 4e3) return 3;
  if (total > 1e3) return 1;
  return 0;
}
function getEnhancedSpecificityBreakdown(input) {
  return {
    codeComplexity: detectCodeComplexity(input),
    mathComplexity: detectMathComplexity(input),
    reasoningDepth: detectReasoningDepth(input),
    contextSize: detectEnhancedContextSize(input),
    toolCalling: detectToolCalling(input),
    domainSpecificity: detectDomainSpecificity(input)
  };
}
export {
  detectCodeComplexity,
  detectContextSize,
  detectConversationDepth,
  detectDomainSpecificity,
  detectEnhancedContextSize,
  detectErrorContext,
  detectFileReferences,
  detectMathComplexity,
  detectReasoningDepth,
  detectToolCalling,
  estimateMessageTokens,
  estimateTokens,
  getEnhancedSpecificityBreakdown,
  getSpecificityBreakdown
};
