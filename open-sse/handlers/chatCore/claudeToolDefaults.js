function defaultClaudeToolType(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (tool && typeof tool === "object" && !Array.isArray(tool)) {
      return tool.type ? tool : { type: "custom", ...tool };
    }
    return tool;
  });
}
export {
  defaultClaudeToolType
};
