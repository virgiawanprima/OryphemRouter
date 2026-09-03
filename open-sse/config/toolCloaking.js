function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function stripEnumDescriptions(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) {
    return schema.map((entry) => stripEnumDescriptions(entry));
  }
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key !== "enumDescriptions") {
      result[key] = stripEnumDescriptions(value);
    }
  }
  return result;
}
function sanitizeAntigravityToolPayload(body) {
  const request = asRecord(body.request);
  if (!request || !Array.isArray(request.tools)) {
    return body;
  }
  let changed = false;
  const tools = request.tools.map((toolValue) => {
    const tool = asRecord(toolValue);
    if (!tool || !Array.isArray(tool.functionDeclarations)) {
      return toolValue;
    }
    let declarationsChanged = false;
    const functionDeclarations = tool.functionDeclarations.map((declarationValue) => {
      const declaration = asRecord(declarationValue);
      if (!declaration || declaration.parameters === void 0) {
        return declarationValue;
      }
      declarationsChanged = true;
      return {
        ...declaration,
        parameters: stripEnumDescriptions(declaration.parameters)
      };
    });
    if (!declarationsChanged) {
      return toolValue;
    }
    changed = true;
    return { ...tool, functionDeclarations };
  });
  if (!changed) {
    return body;
  }
  return {
    ...body,
    request: {
      ...request,
      tools
    }
  };
}
export {
  sanitizeAntigravityToolPayload,
  stripEnumDescriptions
};
