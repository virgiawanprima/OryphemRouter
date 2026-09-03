import { spawn } from "node:child_process";
const HEADER_SIZE = 13;
const REGULAR_MESSAGE = 1;
const INITIALIZE_MESSAGE = 200;
const RESPONSE_MESSAGE = 201;
const ERROR_MESSAGE = 202;
const CANCELED_MESSAGE = 203;
const MAX_FRAME_BYTES = 32 * 1024 * 1024;
function encodeVql(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`ZCode protocol requires a non-negative integer, got ${String(value)}`);
  }
  const bytes = [];
  let remaining = value;
  do {
    let next = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) next |= 128;
    bytes.push(next);
  } while (remaining > 0);
  return Buffer.from(bytes);
}
function decodeVql(data, offset) {
  let value = 0;
  let multiplier = 1;
  let cursor = offset;
  for (let i = 0; i < 8; i += 1) {
    if (cursor >= data.byteLength) throw new Error("Truncated ZCode variable-length quantity");
    const next = data[cursor++];
    value += (next & 127) * multiplier;
    if ((next & 128) === 0) return { value, offset: cursor };
    multiplier *= 128;
  }
  throw new Error("Invalid ZCode variable-length quantity");
}
function encodeZcodeValue(value) {
  if (value === void 0) return Buffer.from([0]);
  if (typeof value === "string") {
    const bytes2 = Buffer.from(value, "utf8");
    return Buffer.concat([Buffer.from([1]), encodeVql(bytes2.byteLength), bytes2]);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes2 = Buffer.from(value);
    return Buffer.concat([Buffer.from([2]), encodeVql(bytes2.byteLength), bytes2]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([
      Buffer.from([4]),
      encodeVql(value.length),
      ...value.map((item) => encodeZcodeValue(item))
    ]);
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return Buffer.concat([Buffer.from([6]), encodeVql(value)]);
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error(`Unsupported ZCode protocol value type: ${typeof value}`);
  }
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  return Buffer.concat([Buffer.from([5]), encodeVql(bytes.byteLength), bytes]);
}
function decodeZcodeValue(data, offset = 0) {
  if (offset >= data.byteLength) throw new Error("Truncated ZCode serialized value");
  const type = data[offset++];
  if (type === 0) return { value: void 0, offset };
  if (type === 1 || type === 2) {
    const length = decodeVql(data, offset);
    const end = length.offset + length.value;
    if (end > data.byteLength) throw new Error("Truncated ZCode byte/string value");
    const bytes = data.slice(length.offset, end);
    return {
      value: type === 1 ? Buffer.from(bytes).toString("utf8") : Buffer.from(bytes),
      offset: end
    };
  }
  if (type === 4) {
    const length = decodeVql(data, offset);
    const values = [];
    let cursor = length.offset;
    for (let i = 0; i < length.value; i += 1) {
      const decoded = decodeZcodeValue(data, cursor);
      values.push(decoded.value);
      cursor = decoded.offset;
    }
    return { value: values, offset: cursor };
  }
  if (type === 5) {
    const length = decodeVql(data, offset);
    const end = length.offset + length.value;
    if (end > data.byteLength) throw new Error("Truncated ZCode JSON value");
    return {
      value: JSON.parse(Buffer.from(data.slice(length.offset, end)).toString("utf8")),
      offset: end
    };
  }
  if (type === 6) {
    const decoded = decodeVql(data, offset);
    return { value: decoded.value, offset: decoded.offset };
  }
  throw new Error(`Unknown ZCode serialized value type ${type}`);
}
function encodeZcodeRpcCall(id, channel, method, args) {
  const body = Buffer.concat([
    encodeZcodeValue([100, id, channel, method]),
    encodeZcodeValue(args)
  ]);
  const frame = Buffer.alloc(HEADER_SIZE + body.byteLength);
  frame.writeUInt8(REGULAR_MESSAGE, 0);
  frame.writeUInt32BE(0, 1);
  frame.writeUInt32BE(0, 5);
  frame.writeUInt32BE(body.byteLength, 9);
  body.copy(frame, HEADER_SIZE);
  return frame;
}
function errorFromPayload(payload, fallback) {
  if (payload && typeof payload === "object") {
    const record = payload;
    const message = typeof record.message === "string" ? record.message : fallback;
    const error = new Error(message);
    if (typeof record.code === "string") Object.assign(error, { code: record.code });
    if (record.data !== void 0) Object.assign(error, { data: record.data });
    return error;
  }
  return new Error(fallback);
}
class ZcodeAppServerClient {
  command;
  args;
  cwd;
  env;
  startupTimeoutMs;
  requestTimeoutMs;
  child;
  outputBuffer = Buffer.alloc(0);
  handshakeDone = false;
  ready = false;
  startPromise;
  serverReady;
  serverReadyError;
  nextRequestId = 1;
  pending = /* @__PURE__ */ new Map();
  constructor(options) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.cwd = options.cwd;
    this.env = options.env;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 1e4;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 3e4;
  }
  async start() {
    if (this.ready) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = void 0;
    });
    return this.startPromise;
  }
  async startInternal() {
    let child;
    try {
      child = spawn(this.command, this.args, {
        cwd: this.cwd,
        env: this.env ? { ...process.env, ...this.env } : process.env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: true
      });
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    this.child = child;
    this.outputBuffer = Buffer.alloc(0);
    this.handshakeDone = false;
    this.ready = false;
    child.stdin.on("error", () => {
    });
    let settled = false;
    const readyPromise = new Promise((resolve, reject) => {
      this.serverReady = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      this.serverReadyError = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
    });
    child.stdout.on("data", (chunk) => this.onStdout(chunk));
    child.stderr.on("data", () => {
    });
    child.on("error", (error) => {
      this.serverReadyError?.(error);
      this.rejectPending(error);
    });
    child.on("exit", (code, signal) => {
      const error = new Error(`ZCode app-server exited: ${code ?? signal ?? "unknown"}`);
      this.ready = false;
      this.handshakeDone = false;
      this.serverReadyError?.(error);
      this.rejectPending(error);
      if (this.child === child) this.child = void 0;
    });
    try {
      await this.withTimeout(readyPromise, this.startupTimeoutMs, "ZCode app-server handshake timed out");
      this.ready = true;
    } catch (error) {
      await this.disposeChild(child);
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      this.serverReady = void 0;
      this.serverReadyError = void 0;
    }
  }
  onStdout(chunk) {
    this.outputBuffer = Buffer.concat([this.outputBuffer, chunk]);
    if (!this.handshakeDone) {
      const newline = this.outputBuffer.indexOf(10);
      if (newline < 0) {
        if (this.outputBuffer.byteLength > 64 * 1024) {
          this.serverReadyError?.(new Error("ZCode hello line is too large"));
        }
        return;
      }
      const line = this.outputBuffer.subarray(0, newline).toString("utf8").trim();
      this.outputBuffer = this.outputBuffer.subarray(newline + 1);
      let hello;
      try {
        hello = JSON.parse(line);
      } catch {
        this.serverReadyError?.(new Error("Invalid ZCode app-server hello"));
        return;
      }
      if (!hello || typeof hello !== "object" || hello.type !== "zcode-hello") {
        this.serverReadyError?.(new Error("Unexpected ZCode app-server hello"));
        return;
      }
      const child = this.child;
      if (!child) return;
      child.stdin.write(`${JSON.stringify({
        type: "zcode-hello-ack",
        version: "omniroute",
        clientId: `omniroute-${process.pid}`
      })}
`);
      this.handshakeDone = true;
    }
    this.consumeFrames();
  }
  consumeFrames() {
    while (this.outputBuffer.byteLength >= HEADER_SIZE) {
      const type = this.outputBuffer.readUInt8(0);
      const length = this.outputBuffer.readUInt32BE(9);
      if (length > MAX_FRAME_BYTES) {
        const error = new Error("ZCode frame exceeds the configured safety limit");
        this.serverReadyError?.(error);
        this.rejectPending(error);
        return;
      }
      const frameLength = HEADER_SIZE + length;
      if (this.outputBuffer.byteLength < frameLength) return;
      const body = this.outputBuffer.subarray(HEADER_SIZE, frameLength);
      this.outputBuffer = this.outputBuffer.subarray(frameLength);
      if (type !== REGULAR_MESSAGE) continue;
      try {
        const header = decodeZcodeValue(body, 0);
        const payload = decodeZcodeValue(body, header.offset);
        this.handleMessage(header.value, payload.value);
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        this.serverReadyError?.(normalized);
        this.rejectPending(normalized);
      }
    }
  }
  handleMessage(headerValue, payload) {
    if (!Array.isArray(headerValue)) return;
    const type = headerValue[0];
    if (type === INITIALIZE_MESSAGE) {
      this.serverReady?.();
      return;
    }
    if (type !== RESPONSE_MESSAGE && type !== ERROR_MESSAGE && type !== CANCELED_MESSAGE) return;
    const requestId = headerValue[1];
    if (typeof requestId !== "number") return;
    const request = this.pending.get(requestId);
    if (!request) return;
    this.pending.delete(requestId);
    clearTimeout(request.timer);
    if (type === RESPONSE_MESSAGE) {
      request.resolve(payload);
    } else {
      request.reject(errorFromPayload(
        payload,
        type === ERROR_MESSAGE ? "ZCode RPC request failed" : "ZCode RPC request canceled"
      ));
    }
  }
  async call(channel, method, args) {
    await this.start();
    const child = this.child;
    if (!child || !this.ready) throw new Error("ZCode app-server is not ready");
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`ZCode RPC request timed out: ${channel}.${method}`));
      }, this.requestTimeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        child.stdin.write(encodeZcodeRpcCall(requestId, channel, method, args));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  async close() {
    const child = this.child;
    this.ready = false;
    this.handshakeDone = false;
    this.child = void 0;
    this.serverReadyError?.(new Error("ZCode app-server closed"));
    this.rejectPending(new Error("ZCode app-server closed"));
    if (child) await this.disposeChild(child);
  }
  rejectPending(error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
  async disposeChild(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once("close", () => resolve()));
    try {
      child.stdin.end();
    } catch {
    }
    if (!child.killed) child.kill("SIGTERM");
    let timer;
    await Promise.race([
      exited,
      new Promise((resolve) => {
        timer = setTimeout(resolve, 1500);
        timer.unref?.();
      })
    ]);
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  }
  async withTimeout(promise, timeoutMs, message) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), timeoutMs);
          timer.unref?.();
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
export {
  ZcodeAppServerClient,
  decodeZcodeValue,
  encodeZcodeRpcCall,
  encodeZcodeValue
};
