import { NO_RENDER } from "./types.js";
function renderTerraformPlan(text, _detection) {
  if (/^No changes\./m.test(text)) return NO_RENDER(text);
  const planMatch = text.match(/Plan:\s+(\d+)\s+to add,\s+(\d+)\s+to change,\s+(\d+)\s+to destroy/);
  if (!planMatch) return NO_RENDER(text);
  const [, add, change, destroy] = planMatch;
  const summary = `Plan: +${add} ~${change} -${destroy}`;
  const resources = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s+#\s+(\S+)\s+will\s+be\s+\S+/);
    if (m) {
      resources.push(`  # ${m[1]} will be ${line.trim().replace(/^#\s+\S+\s+will\s+be\s+/, "")}`);
    }
  }
  const out = [summary, ...resources].join("\n");
  return { text: out, changed: true, renderer: "terraform-plan" };
}
export {
  renderTerraformPlan
};
