const GLOBAL_KEY = "__omniroute_systemPrompt_config__";
const _store = globalThis;
function getConfig() {
  if (!_store[GLOBAL_KEY]) {
    _store[GLOBAL_KEY] = {
      enabled: false,
      prefixPrompt: "",
      suffixPrompt: "",
      prompt: ""
    };
  }
  return _store[GLOBAL_KEY];
}
function setConfig(cfg) {
  _store[GLOBAL_KEY] = cfg;
}
function setSystemPromptConfig(config) {
  const current = getConfig();
  const base = { ...current };
  if ("prefixPrompt" in config || "suffixPrompt" in config) {
    base.prompt = "";
  }
  const merged = { ...base, ...config };
  if (merged.prompt && !merged.suffixPrompt && !("suffixPrompt" in config)) {
    merged.suffixPrompt = merged.prompt;
  }
  setConfig(merged);
}
function getSystemPromptConfig() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled,
    prefixPrompt: cfg.prefixPrompt,
    suffixPrompt: cfg.suffixPrompt
  };
}
function injectSystemPrompt(body) {
  const cfg = getConfig();
  if (!cfg.enabled) return body;
  const prefix = cfg.prefixPrompt || "";
  const suffix = cfg.suffixPrompt || "";
  if (!prefix && !suffix) return body;
  if (!body || typeof body !== "object") return body;
  if (body._skipSystemPrompt) return body;
  const result = { ...body };
  if (result.messages && Array.isArray(result.messages)) {
    const sysIdx = result.messages.findIndex((m) => m.role === "system" || m.role === "developer");
    result.messages = [...result.messages];
    if (sysIdx >= 0) {
      const msg = { ...result.messages[sysIdx] };
      if (Array.isArray(msg.content)) {
        const content = [...msg.content];
        if (prefix) content.unshift({ type: "text", text: prefix });
        if (suffix) content.push({ type: "text", text: suffix });
        msg.content = content;
      } else {
        let content = msg.content || "";
        if (prefix) content = prefix + "\n\n" + content;
        if (suffix) content = content + "\n\n" + suffix;
        msg.content = content;
      }
      result.messages[sysIdx] = msg;
    } else {
      const combined = [prefix, suffix].filter(Boolean).join("\n\n");
      if (combined) {
        result.messages = [{ role: "system", content: combined }, ...result.messages];
      }
    }
  }
  if (result.system !== void 0) {
    if (typeof result.system === "string") {
      let sys = result.system;
      if (prefix) sys = prefix + "\n\n" + sys;
      if (suffix) sys = sys + "\n\n" + suffix;
      result.system = sys;
    } else if (Array.isArray(result.system)) {
      let arr = [...result.system];
      if (prefix) arr = [{ type: "text", text: prefix }, ...arr];
      if (suffix) arr = [...arr, { type: "text", text: suffix }];
      result.system = arr;
    }
  }
  return result;
}
function injectCustomSystemPrompt(body, prompt) {
  if (!prompt || typeof prompt !== "string") return body;
  if (!body || typeof body !== "object") return body;
  if (body._skipSystemPrompt) return body;
  const result = { ...body };
  if (result.messages && Array.isArray(result.messages)) {
    const sysIdx = result.messages.findIndex(
      (m) => m.role === "system" || m.role === "developer"
    );
    result.messages = [...result.messages];
    if (sysIdx >= 0) {
      const msg = { ...result.messages[sysIdx] };
      if (Array.isArray(msg.content)) {
        msg.content = [...msg.content, { type: "text", text: prompt }];
      } else {
        msg.content = (msg.content ? msg.content + "\n\n" : "") + prompt;
      }
      result.messages[sysIdx] = msg;
    } else {
      result.messages = [
        { role: "system", content: prompt },
        ...result.messages
      ];
    }
  }
  if (result.system !== void 0) {
    if (typeof result.system === "string") {
      result.system = result.system ? result.system + "\n\n" + prompt : prompt;
    } else if (Array.isArray(result.system)) {
      result.system = [...result.system, { type: "text", text: prompt }];
    }
  }
  return result;
}
export {
  getSystemPromptConfig,
  injectCustomSystemPrompt,
  injectSystemPrompt,
  setSystemPromptConfig
};
