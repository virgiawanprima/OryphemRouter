// Cursor Agent image generation — ported from OmniRoute
// imageGeneration/providers/cursorAgentImage.ts. Spawns the Cursor `agent`
// CLI's native generateImage tool in a temp workspace, then returns the
// produced raster (PNG/JPEG) as b64_json.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { nowSec } from "./_base.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["cursor"]?.imageConfig?.baseUrl || "agent://cursor-agent";

const DEFAULT_TIMEOUT_MS = 210_000;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MODEL = "auto";
const MAX_N = 4;
const MAX_TIMEOUT_MS = 300_000;

// The ORP imageRegistry stub has no cursor entry; keep the allowlist local.
const CURSOR_IMAGE_MODEL_ALLOWLIST = new Set(["auto", "composer-2", "composer-2.5"]);

export const CURSOR_AGENT_IMAGE_FORMAT = "cursor-agent-image";

export function supportsModel(model) {
  return typeof model === "string" && (CURSOR_IMAGE_MODEL_ALLOWLIST.has(model) || model === "cursor");
}

export function getModels() {
  return [...CURSOR_IMAGE_MODEL_ALLOWLIST];
}

export function resolveCursorImageModel(candidate) {
  const requested = typeof candidate === "string" ? candidate.trim() : "";
  return CURSOR_IMAGE_MODEL_ALLOWLIST.has(requested) ? requested : DEFAULT_MODEL;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export function buildCursorAgentImagePrompt(userPrompt, outPath, size) {
  const sizeHint = typeof size === "string" && size.trim() ? ` Target size/aspect: ${size.trim()}.` : "";
  return [
    "You have a native image-generation tool. Use it to generate ONE image.",
    "Do NOT write code, do NOT hand-author SVG, do NOT install packages — use your built-in image generation.",
    `Image to generate: ${userPrompt}.${sizeHint}`,
    `Save the resulting image to exactly this path: ${outPath}.`,
    "When the file exists at that exact path, reply with only the word DONE.",
  ].join(" ");
}

export function normalizeCursorSeatToken(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.includes("::") ? trimmed.split("::").slice(1).join("::").trim() || trimmed : trimmed;
}

export function buildCursorAgentAuthEnv(token) {
  const clean = normalizeCursorSeatToken(token);
  if (clean.startsWith("crsr_")) {
    return { CURSOR_API_KEY: clean };
  }
  return { CURSOR_AUTH_TOKEN: clean };
}

export function resolveCursorAgentBin(override) {
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }
  const envBin = process.env.CURSOR_AGENT_BIN?.trim();
  if (envBin) return envBin;
  const defaultShim = join(homedir(), ".local", "bin", "agent");
  if (existsSync(defaultShim)) return defaultShim;
  return "agent";
}

export function isRasterImageBuffer(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return true;
  if (buf.length >= 3 && buf.subarray(0, 3).equals(JPEG_MAGIC)) return true;
  return false;
}

export async function findCursorAgentImageOutput(workspace, preferredPath) {
  if (existsSync(preferredPath)) return preferredPath;
  try {
    const entries = await readdir(workspace);
    const match = entries.find((name) => /\.(png|jpe?g|webp)$/i.test(name));
    return match ? join(workspace, match) : null;
  } catch {
    return null;
  }
}

function normalizePositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const i = Math.floor(n);
  return typeof max === "number" ? Math.min(i, max) : i;
}

export function resolveCursorImageTimeoutMs(rawTimeout) {
  return normalizePositiveInt(
    rawTimeout,
    normalizePositiveInt(process.env.CURSOR_IMG_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    MAX_TIMEOUT_MS
  );
}

function extractSeatToken(credentials) {
  const raw = credentials?.accessToken || credentials?.apiKey || "";
  return typeof raw === "string" ? raw.trim() : "";
}

function extractAgentBinOverride(credentials) {
  const psd = credentials?.providerSpecificData;
  if (!psd || typeof psd !== "object" || Array.isArray(psd)) return null;
  const bin = psd.agentBin;
  return typeof bin === "string" && bin.trim() ? bin.trim() : null;
}

function extractAgentModel(credentials, requestModel) {
  const psd = credentials?.providerSpecificData;
  if (psd && typeof psd === "object" && !Array.isArray(psd)) {
    const fromPsd = psd.imageModel;
    if (typeof fromPsd === "string" && fromPsd.trim()) return fromPsd.trim();
  }
  if (process.env.CURSOR_IMG_MODEL?.trim()) return process.env.CURSOR_IMG_MODEL.trim();
  return resolveCursorImageModel(requestModel && requestModel !== "cursor" ? requestModel : DEFAULT_MODEL);
}

// process-wide concurrency gate (one shared Cursor seat)
let activeGenerations = 0;
const waitQueue = [];

export function __resetCursorAgentImageConcurrencyForTests() {
  activeGenerations = 0;
  waitQueue.length = 0;
}

function maxConcurrent() {
  return normalizePositiveInt(process.env.CURSOR_IMG_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT);
}

async function acquireSlot() {
  if (activeGenerations < maxConcurrent()) {
    activeGenerations += 1;
    return;
  }
  await new Promise((resolve) => {
    waitQueue.push(() => {
      activeGenerations += 1;
      resolve();
    });
  });
}

function releaseSlot() {
  activeGenerations = Math.max(0, activeGenerations - 1);
  const next = waitQueue.shift();
  if (next) next();
}

export function runCursorAgentImageProcess(opts) {
  const spawnImpl = opts.spawnImpl ?? spawn;
  const args = ["-p", "--force", "--model", opts.model, "--workspace", opts.workspace, "--output-format", "text", opts.prompt];
  return new Promise((resolve, reject) => {
    const child = spawnImpl(opts.agentBin, args, {
      cwd: opts.workspace,
      env: { ...process.env, ...opts.authEnv, HOME: process.env.HOME || homedir() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Cursor Agent image generation timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`Cursor Agent exited ${code}: ${(stderr || stdout).trim().slice(0, 400) || "no output"}`));
    });
  });
}

async function generateOneImage(params) {
  const workspace = await mkdtemp(join(tmpdir(), "omni-cursor-img-"));
  const outPath = join(workspace, "out.png");
  const prompt = buildCursorAgentImagePrompt(params.userPrompt, outPath, params.size);
  try {
    await runCursorAgentImageProcess({
      agentBin: params.agentBin,
      workspace,
      prompt,
      model: params.model,
      authEnv: params.authEnv,
      timeoutMs: params.timeoutMs,
      spawnImpl: params.spawnImpl,
    });
    const found = await findCursorAgentImageOutput(workspace, outPath);
    if (!found) throw new Error("Cursor Agent produced no image file in the workspace");
    const buf = await readFile(found);
    if (!isRasterImageBuffer(buf)) throw new Error("Cursor Agent output is not a PNG/JPEG raster");
    return buf;
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

export async function generateImage({ model, body, credentials, log, spawnImpl, peerLocality }) {
  // This adapter spawns a local process; allow loopback/lan only when the
  // caller supplies a locality verdict, otherwise permit (operator-gated).
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new Error("Prompt is required for Cursor Agent image generation");
  const token = extractSeatToken(credentials);
  if (!token) throw new Error("Cursor credentials missing accessToken — reconnect the Cursor provider");

  const agentBin = resolveCursorAgentBin(extractAgentBinOverride(credentials));
  if (agentBin !== "agent" && !existsSync(agentBin)) {
    throw new Error("Cursor Agent CLI not found. Install the Cursor `agent` binary and set CURSOR_AGENT_BIN, or set providerSpecificData.agentBin on the Cursor connection.");
  }

  const timeoutMs = resolveCursorImageTimeoutMs(body.timeout_ms);
  const count = normalizePositiveInt(body.n, 1, MAX_N);
  const agentModel = extractAgentModel(credentials, model);
  const authEnv = buildCursorAgentAuthEnv(token);
  log?.info?.("IMAGE", `cursor/${model} (cursor-agent-image) | n=${count} model=${agentModel} bin=${agentBin}`);

  const images = [];
  try {
    for (let i = 0; i < count; i++) {
      await acquireSlot();
      try {
        const buf = await generateOneImage({
          userPrompt: prompt,
          size: body.size,
          agentBin: agentBin || "agent",
          model: agentModel,
          authEnv,
          timeoutMs,
          spawnImpl,
        });
        images.push({ b64_json: buf.toString("base64"), revised_prompt: prompt });
      } finally {
        releaseSlot();
      }
    }
    return { created: nowSec(), data: images };
  } catch (err) {
    const errorText = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
    log?.error?.("IMAGE", `cursor cursor-agent-image error: ${errorText}`);
    if (err && typeof err === "object" && err.code === "ENOENT") {
      throw new Error("Cursor Agent CLI not found on PATH. Set CURSOR_AGENT_BIN to the `agent` binary.");
    }
    throw new Error(errorText);
  }
}

export default {
  useExecutor: true,
  buildUrl: () => BASE_URL,
  buildHeaders: () => ({}),
  buildBody: () => ({}),
  async executeViaExecutor(model, body, credentials, log) {
    return generateImage({ model, body, credentials, log });
  },
  normalize: (responseBody) => responseBody,
  generateImage,
  supportsModel,
  getModels,
};
