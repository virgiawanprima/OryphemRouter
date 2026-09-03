import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { access } from "node:fs/promises";
import { BaseExecutor } from "./base.js";
import { buildErrorBody, errorResponse, sanitizeErrorMessage } from "../utils/errorSanitize.js";
import auggieProvider from "../providers/registry/auggie.js";
const AUGGIE_URL = "auggie://cli/stdio";
const AUGGIE_MODEL_ALLOWLIST = new Set(auggieProvider.models.map((m) => m.id));
const DEFAULT_AUGGIE_MODEL = auggieProvider.models[0]?.id ?? "claude-sonnet-4.6";
const AUGGIE_MODEL_ALIASES = /* @__PURE__ */ new Map([
  // Claude
  ["claude-sonnet-4.6", "sonnet4.6"],
  ["claude-sonnet-4.6-thinking", "sonnet4.6"],
  ["claude-opus-4.6", "opus4.6"],
  ["claude-haiku-4.5", "haiku4.5"],
  // Gemini
  ["gemini-3.1-pro", "gemini-3.1-pro-preview"],
  ["gemini-3.0-flash", "gemini-3.1-pro-preview"],
  // GPT-5.x (high/medium split was synthetic — v0.32.0 has a single ID per version)
  ["gpt-5.5-high", "gpt5.5"],
  ["gpt-5.5-medium", "gpt5.5"],
  ["gpt-5.4-high", "gpt5.4"],
  ["gpt-5.4-medium", "gpt5.4"]
]);
let liveModelSet = null;
async function initAuggieModels(signal, timeoutMs = 8e3) {
  if (liveModelSet !== null) return;
  let bin;
  try {
    bin = await resolveAuggieBin();
  } catch {
    liveModelSet = /* @__PURE__ */ new Set();
    return;
  }
  const child = spawn(bin, ["model", "list"], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true
  });
  const fragments = [];
  child.stdout.on("data", (d) => fragments.push(d.toString("utf8")));
  let settled = false;
  const settle = (result) => {
    if (settled) return;
    settled = true;
    liveModelSet = result;
  };
  const timer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
    settle(/* @__PURE__ */ new Set());
  }, timeoutMs);
  const onAbort = () => {
    if (!child.killed) child.kill("SIGKILL");
    clearTimeout(timer);
    settle(/* @__PURE__ */ new Set());
  };
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      settle(/* @__PURE__ */ new Set());
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const code = await new Promise((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", (e) => reject(e));
    });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (code !== 0) {
      settle(/* @__PURE__ */ new Set());
      return;
    }
    const ids = /* @__PURE__ */ new Set();
    for (const line of fragments.join("").split("\n")) {
      const m = line.match(/\[([^\]]+)\]/);
      if (m) ids.add(m[1]);
    }
    settle(ids.size > 0 ? ids : /* @__PURE__ */ new Set());
  } catch {
    clearTimeout(timer);
    settle(/* @__PURE__ */ new Set());
    signal?.removeEventListener("abort", onAbort);
  }
}
function isAuggieModelFailure(resolution) {
  return !resolution.ok;
}
function resolveAuggieModel(model) {
  const requested = typeof model === "string" ? model.trim() : "";
  if (!requested) return { ok: true, model: DEFAULT_AUGGIE_MODEL };
  if (requested.startsWith("-")) {
    return {
      ok: false,
      error: `Invalid Auggie model "${requested}": model must not start with "-".`
    };
  }
  const requestedAlias = AUGGIE_MODEL_ALIASES.get(requested);
  if (requestedAlias) return { ok: true, model: requestedAlias };
  if (AUGGIE_MODEL_ALLOWLIST.has(requested)) return { ok: true, model: requested };
  if (liveModelSet?.has(requested)) return { ok: true, model: requested };
  const known = [...AUGGIE_MODEL_ALLOWLIST];
  if (liveModelSet) known.push(...liveModelSet);
  return {
    ok: false,
    error: `Unknown Auggie model "${requested}". Supported models: ${known.join(", ")}.`
  };
}
function buildAuggieArgs(model) {
  return ["--print", "--quiet", "--model", model, "--"];
}
function buildAuggieSpawnOptions(stdio) {
  return {
    env: process.env,
    stdio,
    shell: process.platform === "win32"
  };
}
async function resolveAuggieBin() {
  const envBin = (process.env.AUGGIE_BIN || process.env.CLI_AUGGIE_BIN || "").trim();
  if (envBin) return envBin;
  const isWin = process.platform === "win32";
  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const winPath = path.join(localAppData, "auggie", "bin", "auggie.exe");
    if (await access(winPath).then(() => true).catch(() => false)) return winPath;
  }
  const home = os.homedir();
  for (const candidate of [
    path.join(home, ".local", "share", "auggie", "bin", "auggie"),
    path.join(home, ".auggie", "bin", "auggie")
  ]) {
    if (await access(candidate).then(() => true).catch(() => false)) return candidate;
  }
  return isWin ? "auggie.cmd" : "auggie";
}
function buildAuggiePrompt(messages) {
  const lines = [];
  for (const m of messages) {
    const role = String(m.role || "user");
    let text = "";
    if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p && typeof p === "object" && p.type === "text") {
          text += String(p.text || "");
        }
      }
    }
    if (!text.trim()) continue;
    if (role === "system") {
      lines.push(`[System]
${text}`);
    } else if (role === "assistant") {
      lines.push(`[Assistant]
${text}`);
    } else {
      lines.push(`[User]
${text}`);
    }
  }
  return lines.join("\n\n") || "(empty)";
}
function isEnoentLike(message) {
  return message.includes("ENOENT") || message.includes("not found");
}
async function checkAuggieCliVersion(timeoutMs = 5e3) {
  const bin = await resolveAuggieBin();
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawn(bin, ["--version"], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      settle({ ok: false, error: isEnoentLike(message) ? cliNotFoundMessage(bin) : message });
      return;
    }
    const timer = setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      settle({ ok: false, error: "Auggie CLI version check timed out" });
    }, timeoutMs);
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      const message = err?.message || String(err);
      settle({ ok: false, error: isEnoentLike(message) ? cliNotFoundMessage(bin) : message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        settle({ ok: true, version: stdout.trim().slice(0, 200) });
      } else {
        settle({ ok: false, error: `Auggie CLI exited with code ${code}` });
      }
    });
  });
}
function cliNotFoundMessage(bin) {
  return sanitizeErrorMessage(
    `Auggie CLI not found: ${bin}. Install it and run "auggie login", or set AUGGIE_BIN to an absolute path.`
  );
}
class AuggieExecutor extends BaseExecutor {
  constructor() {
    super("auggie", { id: "auggie", baseUrl: "" });
  }
  buildUrl() {
    return AUGGIE_URL;
  }
  buildHeaders() {
    return {};
  }
  transformRequest() {
    return null;
  }
  /** No-op — auggie has no OmniRoute-managed credentials to refresh. */
  async refreshCredentials(_credentials) {
    return null;
  }
  async execute({ model, body, stream, signal, log }) {
    const b = body ?? {};
    const messages = Array.isArray(b.messages) ? b.messages : [];
    const promptText = buildAuggiePrompt(messages);
    const auggieBin = await resolveAuggieBin();
    const wantsStream = stream !== false;
    await initAuggieModels(signal);
    const modelResolution = resolveAuggieModel(model);
    if (isAuggieModelFailure(modelResolution)) {
      const response2 = wantsStream ? buildAuggieSseError(modelResolution.error) : errorResponse(400, modelResolution.error);
      return { response: response2, url: AUGGIE_URL, headers: {}, transformedBody: { error: true } };
    }
    const safeModel = modelResolution.model;
    log?.info?.(
      "AUGGIE",
      `auggie --print \u2192 model=${safeModel}, bin=${auggieBin}, stream=${wantsStream}`
    );
    const response = wantsStream ? this.runStreaming(auggieBin, safeModel, promptText, signal, log) : await this.runNonStreaming(auggieBin, safeModel, promptText, signal, log);
    return {
      response,
      url: AUGGIE_URL,
      headers: {},
      transformedBody: { model: safeModel, promptLength: promptText.length }
    };
  }
  spawnAuggie(auggieBin, model, promptText) {
    const child = spawn(
      auggieBin,
      buildAuggieArgs(model),
      buildAuggieSpawnOptions(["pipe", "pipe", "pipe"])
    );
    child.stdin.on("error", () => {
    });
    try {
      child.stdin.write(promptText);
      child.stdin.end();
    } catch {
    }
    return child;
  }
  runStreaming(auggieBin, model, promptText, signal, log) {
    const responseId = `chatcmpl-auggie-${Date.now()}`;
    const created = Math.floor(Date.now() / 1e3);
    const sseStream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const emit = (data) => controller.enqueue(enc.encode(data));
        let closed = false;
        let roleEmitted = false;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
            }
          }
        };
        const emitDelta = (delta) => {
          if (!delta) return;
          if (!roleEmitted) {
            emit(
              `data: ${JSON.stringify({
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  { index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }
                ]
              })}

`
            );
            roleEmitted = true;
          }
          emit(
            `data: ${JSON.stringify({
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: { content: delta }, finish_reason: null }]
            })}

`
          );
        };
        const emitError = (message) => {
          emit(`data: ${JSON.stringify(buildErrorBody(502, message))}

`);
          emit("data: [DONE]\n\n");
          finish();
        };
        const emitStop = () => {
          emit(
            `data: ${JSON.stringify({
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
            })}

`
          );
          emit("data: [DONE]\n\n");
          finish();
        };
        let child;
        try {
          child = spawn(
            auggieBin,
            buildAuggieArgs(model),
            buildAuggieSpawnOptions(["pipe", "pipe", "pipe"])
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emitError(
            isEnoentLike(message) ? cliNotFoundMessage(auggieBin) : sanitizeErrorMessage(message)
          );
          return;
        }
        child.stdin.on("error", () => {
        });
        try {
          child.stdin.write(promptText);
          child.stdin.end();
        } catch {
        }
        if (signal) {
          signal.addEventListener("abort", () => {
            if (!child.killed) child.kill("SIGTERM");
            finish();
          });
        }
        child.on("error", (err) => {
          const message = err?.message || String(err);
          emitError(
            isEnoentLike(message) ? cliNotFoundMessage(auggieBin) : sanitizeErrorMessage(message)
          );
        });
        let stderrTail = "";
        child.stdout?.on("data", (chunk) => {
          emitDelta(chunk.toString("utf8"));
        });
        child.stderr?.on("data", (chunk) => {
          stderrTail = (stderrTail + chunk.toString("utf8")).slice(-2e3);
          log?.debug?.("AUGGIE", `stderr: ${chunk.toString("utf8").slice(0, 200)}`);
        });
        child.on("close", (code) => {
          if (finished) return;
          if (code !== 0) {
            emitError(
              sanitizeErrorMessage(
                `Auggie CLI exited with code ${code}${stderrTail ? `: ${stderrTail}` : ""}`
              )
            );
            return;
          }
          emitStop();
        });
      },
      cancel() {
      }
    });
    return new Response(sseStream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  }
  runNonStreaming(auggieBin, model, promptText, signal, log) {
    return new Promise((resolve) => {
      let child;
      try {
        child = this.spawnAuggie(auggieBin, model, promptText);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resolve(
          buildAuggieErrorResponse(
            isEnoentLike(message) ? cliNotFoundMessage(auggieBin) : sanitizeErrorMessage(message)
          )
        );
        return;
      }
      let stdout = "";
      let stderrTail = "";
      let settled = false;
      const settle = (response) => {
        if (settled) return;
        settled = true;
        resolve(response);
      };
      if (signal) {
        signal.addEventListener("abort", () => {
          if (!child.killed) child.kill("SIGTERM");
          settle(buildAuggieErrorResponse(sanitizeErrorMessage("Auggie CLI request aborted")));
        });
      }
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk) => {
        stderrTail = (stderrTail + chunk.toString("utf8")).slice(-2e3);
        log?.debug?.("AUGGIE", `stderr: ${chunk.toString("utf8").slice(0, 200)}`);
      });
      child.on("error", (err) => {
        const message = err?.message || String(err);
        settle(
          buildAuggieErrorResponse(
            isEnoentLike(message) ? cliNotFoundMessage(auggieBin) : sanitizeErrorMessage(message)
          )
        );
      });
      child.on("close", (code) => {
        if (code !== 0) {
          settle(
            buildAuggieErrorResponse(
              sanitizeErrorMessage(
                `Auggie CLI exited with code ${code}${stderrTail ? `: ${stderrTail}` : ""}`
              )
            )
          );
          return;
        }
        settle(buildChatCompletionResponse(model, promptText, stdout));
      });
    });
  }
}
function buildChatCompletionResponse(model, promptText, content) {
  const trimmed = content.trim();
  const body = {
    id: `chatcmpl-auggie-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: trimmed },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: Math.ceil(promptText.length / 4),
      completion_tokens: Math.ceil(trimmed.length / 4),
      total_tokens: Math.ceil((promptText.length + trimmed.length) / 4),
      estimated: true
    }
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
function buildAuggieErrorResponse(message) {
  return errorResponse(502, message);
}
function buildAuggieSseError(message) {
  const enc = new TextEncoder();
  const sseStream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(`data: ${JSON.stringify(buildErrorBody(400, message))}

`));
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
  return new Response(sseStream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
function __resetAuggieModels() {
  liveModelSet = null;
}
export {
  AuggieExecutor,
  __resetAuggieModels,
  buildAuggiePrompt,
  buildAuggieSpawnOptions,
  checkAuggieCliVersion,
  initAuggieModels,
  resolveAuggieBin,
  resolveAuggieModel
};
