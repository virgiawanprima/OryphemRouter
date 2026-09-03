function effectiveTtl(marker) {
  const ttl = marker?.ttl;
  return typeof ttl === "string" ? ttl : "5m";
}
function isCacheBreakpointTarget(block) {
  if (block === null || typeof block !== "object") return false;
  const candidate = block;
  switch (candidate.type) {
    case "text":
      return typeof candidate.text === "string" && candidate.text.length > 0;
    case "tool_use":
    case "image":
    case "image_url":
    case "file":
    case "file_url":
    case "document":
      return true;
    case "tool_result": {
      const payload = candidate.content ?? candidate.text ?? candidate.output;
      if (typeof payload === "string") return payload.length > 0;
      if (Array.isArray(payload)) {
        return payload.some((part) => {
          const text = part?.text;
          return part?.type === "text" && typeof text === "string" && text.length > 0;
        });
      }
      return payload != null;
    }
    default:
      return false;
  }
}
function relocateHoistedCacheBoundary(marker, preceding) {
  for (let i = preceding.length - 1; i >= 0; i--) {
    const content = preceding[i]?.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const block = content[j];
      if (!isCacheBreakpointTarget(block)) continue;
      if (block.cache_control == null) {
        block.cache_control = marker;
        return "moved";
      }
      return effectiveTtl(marker) === "5m" && effectiveTtl(block.cache_control) === "1h" ? "dropped" : "kept";
    }
  }
  return "kept";
}
function extractSystemRoleMessages(payload) {
  if (!Array.isArray(payload.messages)) return;
  const messages = payload.messages;
  const isSystemRole = (role) => typeof role === "string" && (role.toLowerCase() === "system" || role.toLowerCase() === "developer");
  const systemMessages = messages.filter((m) => isSystemRole(m.role));
  if (systemMessages.length === 0) return;
  const extraBlocks = [];
  const preceding = [];
  for (const sm of messages) {
    if (!isSystemRole(sm.role)) {
      preceding.push(sm);
      continue;
    }
    if (typeof sm.content === "string" && sm.content.length > 0) {
      extraBlocks.push({ type: "text", text: sm.content });
    } else if (Array.isArray(sm.content)) {
      for (const block of sm.content) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.length > 0) {
          const hoisted = { ...block };
          if (hoisted.cache_control != null && relocateHoistedCacheBoundary(hoisted.cache_control, preceding) !== "kept") {
            delete hoisted.cache_control;
          }
          extraBlocks.push(hoisted);
        }
      }
    }
    if (payload.output_config == null) {
      const directive = sm;
      if (directive.output_config != null && typeof directive.output_config === "object" && !Array.isArray(directive.output_config)) {
        payload.output_config = directive.output_config;
      }
    }
  }
  if (extraBlocks.length > 0) {
    const existingSystem = payload.system;
    if (typeof existingSystem === "string" && existingSystem.length > 0) {
      payload.system = [{ type: "text", text: existingSystem }, ...extraBlocks];
    } else if (Array.isArray(existingSystem)) {
      payload.system = [...existingSystem, ...extraBlocks];
    } else {
      payload.system = extraBlocks;
    }
  }
  payload.messages = messages.filter((m) => !isSystemRole(m.role));
}
function relocateDirectiveOnlyMessages(payload) {
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) return;
  const messages = payload.messages;
  const isSystemRole = (role) => typeof role === "string" && (role.toLowerCase() === "system" || role.toLowerCase() === "developer");
  const isEmptySystem = (m) => m != null && typeof m === "object" && isSystemRole(m.role) && Array.isArray(m.content) && m.content.length === 0;
  const isDirectiveOnly = (m) => isEmptySystem(m) && m.output_config != null && typeof m.output_config === "object" && !Array.isArray(m.output_config);
  if (!isEmptySystem(messages[0])) {
    return;
  }
  let runEnd = 0;
  while (runEnd < messages.length && isEmptySystem(messages[runEnd])) {
    runEnd++;
  }
  const lead = messages.slice(0, runEnd);
  const directives = lead.filter(isDirectiveOnly);
  let insertAfter = -1;
  for (let i = runEnd; i < messages.length; i++) {
    const candidate = messages[i];
    if (candidate != null && typeof candidate === "object" && !isSystemRole(candidate.role)) {
      insertAfter = i;
      break;
    }
  }
  if (insertAfter === -1) {
    if (payload.output_config == null && directives.length > 0) {
      payload.output_config = directives[0].output_config;
    }
    payload.messages = messages.slice(runEnd);
    return;
  }
  payload.messages = [
    ...messages.slice(runEnd, insertAfter + 1),
    ...directives,
    ...messages.slice(insertAfter + 1)
  ];
}
export {
  extractSystemRoleMessages,
  relocateDirectiveOnlyMessages,
  relocateHoistedCacheBoundary
};
