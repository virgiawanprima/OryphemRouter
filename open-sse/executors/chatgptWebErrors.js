const CGPT_WEB_HTTP_ERROR_MESSAGES = {
  401: "ChatGPT auth failed \u2014 session may have expired. Re-paste your __Secure-next-auth.session-token.",
  403: "ChatGPT auth failed \u2014 session may have expired. Re-paste your __Secure-next-auth.session-token.",
  404: "ChatGPT returned 404 \u2014 usually the model is no longer available on this account or the chat-requirements-token expired. Retry will start a fresh conversation.",
  413: "ChatGPT returned 413 \u2014 the request payload is too large for ChatGPT web's size limit (often hit by agentic clients like Cline/Kilo that send big system prompts and file context). Reduce the context: enable compression, trim the conversation/files, or use a smaller request.",
  429: "ChatGPT rate limited. Wait a moment and retry."
};
function describeChatGptWebHttpError(status) {
  return CGPT_WEB_HTTP_ERROR_MESSAGES[status] ?? `ChatGPT returned HTTP ${status}`;
}
export {
  describeChatGptWebHttpError
};
