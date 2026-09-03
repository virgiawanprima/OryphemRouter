const APPROVAL_REQUEST_METHODS = /* @__PURE__ */ new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "applyPatchApproval",
  "execCommandApproval"
]);
const ROUTER_APPROVAL_NOTE = "router: harness-controlled execution";
const ROUTER_DENIAL_NOTE = "router: denied by default (set codexAppServerAutoApprove to opt in)";
const TOOL_CALL_REQUEST_METHOD = "item/tool/call";
class CodexAppServerClient {
  ws = null;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  notificationHandler = () => {
  };
  toolCallHandler = null;
  websocketFn;
  defaultTimeoutMs;
  autoApproveApprovals;
  closed = false;
  constructor(options = {}) {
    this.websocketFn = options.websocketFn ?? null;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 12e4;
    this.autoApproveApprovals = options.autoApproveApprovals === true;
  }
  /**
   * Open the WebSocket and attach the capability token as `Authorization: Bearer`.
   * Do NOT add any chatgpt.com Origin/WS header normalization here — the local
   * app-server wants only the Authorization header.
   */
  async connect(url, token) {
    if (!this.websocketFn) {
      throw new Error("Codex app-server websocket transport unavailable");
    }
    this.ws = await this.websocketFn(url, {
      browser: "chrome_142",
      os: "windows",
      headers: { Authorization: `Bearer ${token}` }
    });
    this.ws.onmessage = (event) => this.onFrame(event.data);
    this.ws.onerror = (event) => this.failAll(event?.message ?? "app-server socket error");
    this.ws.onclose = () => this.failAll("app-server connection closed");
  }
  /** Send a ClientRequest and resolve when its id-matched response arrives. */
  request(method, params, timeoutMs = this.defaultTimeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (!this.ws || this.closed) {
        reject(new Error(`Cannot send ${method}: app-server connection is not open`));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }
  /** Send a ClientNotification (no id, no reply expected — e.g. turn/interrupt). */
  notify(method, params) {
    if (!this.ws || this.closed) return;
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }
  /** Register the handler that receives server -> client NOTIFICATIONS (no id). */
  onNotification(fn) {
    this.notificationHandler = fn;
  }
  /**
   * Register the handler for the `item/tool/call` server → client ServerRequest
   * (a harness function-tool invocation). When set, `item/tool/call` is routed to
   * this handler INSTEAD of the default -32601 rejection; the handler must settle
   * the id via the provided `respond`/`respondError`. When unset, `item/tool/call`
   * falls through to the default rejection (keeps the turn unstuck).
   */
  onToolCall(fn) {
    this.toolCallHandler = fn;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws?.close(1e3, "done");
    } catch {
    }
  }
  /** Parse one inbound frame and dispatch by JSON-RPC shape. */
  onFrame(raw) {
    let msg;
    try {
      const line = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const hasId = msg.id !== void 0 && msg.id !== null;
    const hasMethod = typeof msg.method === "string";
    if (hasId && !hasMethod) {
      const id = msg.id;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      if (msg.error) {
        const err = msg.error;
        pending.reject(new Error(`${String(err.code ?? "error")}: ${String(err.message ?? "unknown")}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    if (hasMethod && hasId) {
      const id = msg.id;
      const method = msg.method;
      if (method === TOOL_CALL_REQUEST_METHOD && this.toolCallHandler) {
        this.toolCallHandler(id, msg.params, {
          respond: (result) => this.respondToRequest(id, result),
          respondError: (code, message) => this.respondErrorToRequest(id, code, message)
        });
        return;
      }
      this.answerServerRequest(id, method);
      return;
    }
    if (hasMethod) {
      this.notificationHandler(msg.method, msg.params);
    }
  }
  /**
   * Always answer an inbound ServerRequest so its id is settled. Approval
   * prompts are auto-DENIED unless the operator opted into auto-approval
   * (hardening after the #11205 security review): they gate codex's OWN host
   * command/file execution, not the harness's tools. Anything we cannot
   * service gets a JSON-RPC error so the id is still settled.
   */
  answerServerRequest(id, method) {
    if (!this.ws || this.closed) return;
    if (APPROVAL_REQUEST_METHODS.has(method)) {
      const approved = this.autoApproveApprovals;
      this.ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            decision: approved ? "approved" : "denied",
            note: approved ? ROUTER_APPROVAL_NOTE : ROUTER_DENIAL_NOTE
          }
        })
      );
      return;
    }
    this.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `router: unsupported server request "${method}"`
        }
      })
    );
  }
  /** Settle an inbound ServerRequest id with a JSON-RPC result. */
  respondToRequest(id, result) {
    if (!this.ws || this.closed) return;
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }
  /** Settle an inbound ServerRequest id with a JSON-RPC error. */
  respondErrorToRequest(id, code, message) {
    if (!this.ws || this.closed) return;
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
  }
  failAll(reason) {
    const err = new Error(reason);
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      pending.reject(err);
    }
    this.notificationHandler("__transport_closed__", { reason });
  }
}
export {
  CodexAppServerClient
};
