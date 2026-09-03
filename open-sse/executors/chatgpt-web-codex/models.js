const ROUTES = /* @__PURE__ */ new Map([
  ["instant", { id: "instant", effort: "low", pro: false }],
  ["medium", { id: "medium", effort: "medium", pro: false }],
  ["high", { id: "high", effort: "high", pro: false }],
  ["extra-high", { id: "extra-high", effort: "xhigh", pro: false }],
  ["pro", { id: "pro", effort: "max", pro: true }]
]);
function requireChatGptWebCodexRoute(model) {
  const normalized = model.replace(/^chatgpt-web-codex\//, "");
  const route = ROUTES.get(normalized);
  if (!route) throw new Error(`Unsupported ChatGPT Web (Codex) model: ${model}`);
  return route;
}
function reasoningEffortOf(body) {
  const reasoning = body.reasoning;
  if (reasoning && typeof reasoning === "object" && !Array.isArray(reasoning)) {
    const effort2 = reasoning.effort;
    return typeof effort2 === "string" ? effort2 : void 0;
  }
  const effort = body.reasoning_effort;
  return typeof effort === "string" ? effort : void 0;
}
export {
  reasoningEffortOf,
  requireChatGptWebCodexRoute
};
