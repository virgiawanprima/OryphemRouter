function enforceThinkingTemperature(body) {
  const thinking = body.thinking;
  if (thinking?.type === "enabled" || thinking?.type === "adaptive") {
    body.temperature = 1;
    if (body.top_p !== void 0) {
      delete body.top_p;
    }
  }
}
function disableThinkingIfToolChoiceForced(body) {
  const toolChoice = body.tool_choice;
  if (!toolChoice) return;
  const isForced = toolChoice === "any" || typeof toolChoice === "object" && (toolChoice.type === "any" || toolChoice.type === "tool");
  if (isForced && body.thinking) {
    delete body.thinking;
    delete body.context_management;
  }
}
const MAX_CACHE_CONTROL_BLOCKS = 4;
function enforceCacheControlLimit(body) {
  let count = 0;
  const system = body.system;
  if (Array.isArray(system)) {
    for (const block of system) {
      if (block.cache_control) count++;
    }
  }
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      const content = msg.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.cache_control) count++;
      }
    }
  }
  const tools = body.tools;
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (tool.cache_control) count++;
    }
  }
  if (count <= MAX_CACHE_CONTROL_BLOCKS) return;
  let remaining = MAX_CACHE_CONTROL_BLOCKS;
  if (Array.isArray(system)) {
    for (const block of system) {
      if (block.cache_control) {
        if (remaining > 0) {
          remaining--;
        } else {
          delete block.cache_control;
        }
      }
    }
  }
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      const content = msg.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.cache_control) {
          if (remaining > 0) {
            remaining--;
          } else {
            delete block.cache_control;
          }
        }
      }
    }
  }
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (tool.cache_control) {
        if (remaining > 0) {
          remaining--;
        } else {
          delete tool.cache_control;
        }
      }
    }
  }
}
function ensureCacheControlOnLastUserMessage(body) {
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;
  const system = body.system;
  let cacheControlCount = Array.isArray(system) ? system.filter((block) => block.cache_control).length : 0;
  let hasFiveMinuteCacheControl = Array.isArray(system) ? system.some(
    (block) => block.cache_control?.ttl === "5m"
  ) : false;
  for (const message of messages) {
    const content = message.content;
    if (!Array.isArray(content)) continue;
    cacheControlCount += content.filter((block) => block.cache_control).length;
    hasFiveMinuteCacheControl ||= content.some(
      (block) => block.cache_control?.ttl === "5m"
    );
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (String(messages[i].role) === "user") {
      const content = messages[i].content;
      if (Array.isArray(content) && content.length > 0) {
        const lastBlock = content[content.length - 1];
        if (!lastBlock.cache_control && cacheControlCount < MAX_CACHE_CONTROL_BLOCKS) {
          lastBlock.cache_control = hasFiveMinuteCacheControl ? { type: "ephemeral", ttl: "5m" } : { type: "ephemeral" };
        }
      }
      break;
    }
  }
}
function normalizeCacheControlTtl(body) {
  let hasFiveMinuteCacheControl = false;
  const defaultMissingTtl = (block) => {
    const cc = block?.cache_control;
    if (!cc || cc.type !== "ephemeral") return;
    if (cc.ttl === "5m") {
      hasFiveMinuteCacheControl = true;
    } else if (cc.ttl === void 0) {
      cc.ttl = hasFiveMinuteCacheControl ? "5m" : "1h";
    }
  };
  const tools = body.tools;
  if (Array.isArray(tools)) {
    for (const tool of tools) defaultMissingTtl(tool);
  }
  const system = body.system;
  if (Array.isArray(system)) {
    for (const block of system) defaultMissingTtl(block);
  }
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      const content = message.content;
      if (Array.isArray(content)) {
        for (const block of content) defaultMissingTtl(block);
      }
    }
  }
}
export {
  disableThinkingIfToolChoiceForced,
  enforceCacheControlLimit,
  enforceThinkingTemperature,
  ensureCacheControlOnLastUserMessage,
  normalizeCacheControlTtl
};
