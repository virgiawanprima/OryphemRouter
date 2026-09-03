// OryphemRouter adaptation stub for the ChatGPT-Web (Codex) Responses state
// tracking. Not ported; kept as safe no-ops / passthroughs so the executor's
// previous-response binding checks degrade gracefully.

export function expandPreviousResponseInput(body, _namespace) {
  return body;
}

export function rememberResponseState(_body, _response, _opts) {
  /* no-op */
}

export function clearResponseState(_namespace) {
  /* no-op */
}
