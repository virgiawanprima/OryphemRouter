// Minimal self-contained adaptation of OmniRoute services/contextManager.ts
// tool-message repair helpers (used by xaiMessageCap.js). Ported for
// OryphemRouter; only the three functions xaiMessageCap imports are included.

export function fixToolPairs(messages) {
  // Pass 1: Collect all tool_result IDs from user/tool messages
  const toolResultIds = new Set();
  for (const msg of messages) {
    if (msg.role === "tool" && msg.tool_call_id) {
      toolResultIds.add(msg.tool_call_id);
    }
    if (msg.role === "user" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          toolResultIds.add(block.tool_use_id);
        }
      }
    }
  }

  // Pass 2: Filter assistant messages to remove tool_use without tool_result
  const isLastMessage = (idx) => idx === messages.length - 1;
  const filteredMessages = messages.map((msg, idx) => {
    if (msg.role === "assistant" && !isLastMessage(idx)) {
      let modified = false;
      const newMsg = { ...msg };

      if (Array.isArray(newMsg.tool_calls)) {
        const filteredToolCalls = newMsg.tool_calls.filter(
          (tc) => !tc.id || toolResultIds.has(tc.id)
        );
        if (filteredToolCalls.length !== newMsg.tool_calls.length) {
          newMsg.tool_calls = filteredToolCalls;
          modified = true;
        }
      }

      if (Array.isArray(newMsg.content)) {
        const filteredContent = newMsg.content.filter(
          (block) => block.type !== "tool_use" || !block.id || toolResultIds.has(block.id)
        );
        if (filteredContent.length !== newMsg.content.length) {
          newMsg.content = filteredContent;
          modified = true;
        }
      }

      return modified ? newMsg : msg;
    }
    return msg;
  });
  return filteredMessages;
}

export function fixToolAdjacency(messages) {
  if (messages.length <= 1) return messages;

  const result = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const nextMsg = messages[i + 1];

    if (msg.role !== "assistant" || !nextMsg) {
      result.push(msg);
      continue;
    }

    // Collect tool_result IDs from the NEXT message only
    const nextToolResultIds = new Set();
    if (nextMsg.role === "tool" && nextMsg.tool_call_id) {
      nextToolResultIds.add(String(nextMsg.tool_call_id));
    }
    if (nextMsg.role === "user" && Array.isArray(nextMsg.content)) {
      for (const block of nextMsg.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          nextToolResultIds.add(String(block.tool_use_id));
        }
      }
    }

    let modified = false;
    const newMsg = { ...msg };

    // Filter tool_use blocks in content array (Claude format)
    if (Array.isArray(newMsg.content)) {
      const filteredContent = newMsg.content.filter(
        (block) => block.type !== "tool_use" || !block.id || nextToolResultIds.has(String(block.id))
      );
      if (filteredContent.length !== newMsg.content.length) {
        newMsg.content = filteredContent;
        modified = true;
      }
    }

    // Filter tool_calls array (OpenAI format) — independently of content
    if (Array.isArray(newMsg.tool_calls)) {
      const filteredCalls = newMsg.tool_calls.filter(
        (tc) => !tc.id || nextToolResultIds.has(String(tc.id))
      );
      if (filteredCalls.length !== newMsg.tool_calls.length) {
        newMsg.tool_calls = filteredCalls;
        modified = true;
      }
    }

    result.push(modified ? newMsg : msg);
  }
  return result;
}

export function stripTrailingAssistantOrphanToolUse(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  if (!last || last.role !== "assistant") return messages;

  let modified = false;
  const newLast = { ...last };

  if (Array.isArray(newLast.tool_calls)) {
    const filteredCalls = newLast.tool_calls.filter(() => false);
    if (filteredCalls.length !== newLast.tool_calls.length) {
      newLast.tool_calls = filteredCalls;
      modified = true;
    }
  }

  if (Array.isArray(newLast.content)) {
    const filteredContent = newLast.content.filter((block) => block.type !== "tool_use");
    if (filteredContent.length !== newLast.content.length) {
      newLast.content = filteredContent;
      modified = true;
    }
  }

  if (!modified) return messages;

  // If the last message is now empty, drop it.
  const hasContent =
    typeof newLast.content === "string"
      ? newLast.content.trim().length > 0
      : Array.isArray(newLast.content) && newLast.content.length > 0;
  const hasToolCalls = Array.isArray(newLast.tool_calls) && newLast.tool_calls.length > 0;
  if (hasContent || hasToolCalls) {
    return [...messages.slice(0, lastIdx), newLast];
  }
  return messages.slice(0, lastIdx);
}
