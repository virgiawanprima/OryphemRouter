import { collapseRepeated } from "./collapseRepeated.js";
import { MCP_ACCESSIBILITY_TAIL_RESERVE } from "./constants.js";
const NOISE_LINE_PATTERNS = [/^\s*-\s*generic:?\s*$/, /^\s*-\s*text:\s*""\s*$/];
function isNoiseLine(line) {
  return NOISE_LINE_PATTERNS.some((p) => p.test(line));
}
function smartFilterText(text, config) {
  if (typeof text !== "string" || text.length < config.minLengthToProcess) {
    return text;
  }
  let out = text.split("\n").filter((line) => !isNoiseLine(line)).join("\n");
  out = collapseRepeated(
    out,
    config.collapseThreshold,
    config.collapseKeepHead,
    config.collapseKeepTail
  );
  if (out.length > config.maxTextChars) {
    const headSize = Math.max(0, config.maxTextChars - MCP_ACCESSIBILITY_TAIL_RESERVE);
    const head = out.slice(0, headSize);
    const omitted = out.length - head.length;
    out = `${head}

... [truncated ${omitted} chars by OmniRoute MCP filter. Page is large; ask user to scroll/navigate to a specific section, or click an element with the refs shown above]`;
  }
  return out;
}
import {
  DEFAULT_MCP_ACCESSIBILITY_CONFIG,
  clampMcpAccessibilityConfig,
  MCP_ACCESSIBILITY_TAIL_RESERVE as MCP_ACCESSIBILITY_TAIL_RESERVE2
} from "./constants.js";
export {
  DEFAULT_MCP_ACCESSIBILITY_CONFIG,
  MCP_ACCESSIBILITY_TAIL_RESERVE2 as MCP_ACCESSIBILITY_TAIL_RESERVE,
  clampMcpAccessibilityConfig,
  smartFilterText
};
