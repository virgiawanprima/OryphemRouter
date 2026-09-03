import { NO_RENDER } from "./types.js";
function renderGitDiff(text, _detection) {
  if (!text.includes("@@ ")) {
    return NO_RENDER(text);
  }
  const kept = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ") || line.startsWith("@@ ")) {
      kept.push(line);
    } else if (/^[+-](?![+-])/.test(line)) {
      kept.push(line);
    }
  }
  const out = kept.join("\n");
  if (out === text) return NO_RENDER(text);
  return { text: out, changed: true, renderer: "git-diff" };
}
export {
  renderGitDiff
};
