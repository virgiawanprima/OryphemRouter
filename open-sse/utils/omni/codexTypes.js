function namespacedToolName(namespace, name) {
  return namespace ? `${namespace}__${name}` : name;
}
function toolChoiceAliases(tool) {
  const wireName = namespacedToolName(tool.namespace, tool.name);
  return tool.namespace ? [wireName, `${tool.namespace}.${tool.name}`] : [wireName];
}
function toolAllowedByChoice(tool, allowedTools) {
  return toolChoiceAliases(tool).some((name) => allowedTools.has(name));
}
function resolveToolChoiceWireName(tools, name) {
  const match = tools?.find((tool) => toolChoiceAliases(tool).includes(name));
  return match ? namespacedToolName(match.namespace, match.name) : name;
}
function isAllowedToolChoice(value) {
  return typeof value === "object" && value !== null && "allowedTools" in value;
}
export {
  isAllowedToolChoice,
  namespacedToolName,
  resolveToolChoiceWireName,
  toolAllowedByChoice,
  toolChoiceAliases
};
