import { createHash, randomBytes } from "node:crypto";
import { resolvePublicCred } from "../utils/publicCreds.js";
import { errorResponse } from "../utils/errorSanitize.js";
import { SlidingWindowLimiter } from "../utils/omni/slidingWindowLimiter.js";
const EDGE_TTS_WS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const EDGE_TTS_GEC_VERSION = "1-138.0.0.0";
const WIN_EPOCH_OFFSET_SECONDS = 11644473600;
const SEC_MS_GEC_ROUND_SECONDS = 300;
const DEFAULT_VOICE = "en-US-AriaNeural";
const DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const CONNECT_TIMEOUT_MS = 1e4;
const SYNTH_TIMEOUT_MS = 3e4;
const EDGE_TTS_RATE_WINDOW = { requests: 20, windowMs: 6e4 };
const edgeTtsLimiter = new SlidingWindowLimiter();
function computeSecMsGec(nowMs = Date.now()) {
  let ticks = nowMs / 1e3 + WIN_EPOCH_OFFSET_SECONDS;
  ticks -= ticks % SEC_MS_GEC_ROUND_SECONDS;
  ticks *= 1e7;
  const strToHash = `${Math.floor(ticks)}${resolvePublicCred("edgetts_token")}`;
  return createHash("sha256").update(strToHash, "ascii").digest("hex").toUpperCase();
}
function buildConnectionId() {
  return randomBytes(16).toString("hex");
}
function toIsoTimestamp() {
  return (/* @__PURE__ */ new Date()).toUTCString();
}
function buildSpeechConfigMessage(timestamp = toIsoTimestamp()) {
  const config = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: "false",
            wordBoundaryEnabled: "false"
          },
          outputFormat: DEFAULT_OUTPUT_FORMAT
        }
      }
    }
  };
  return `X-Timestamp:${timestamp}\r
Content-Type:application/json; charset=utf-8\r
Path:speech.config\r
\r
${JSON.stringify(config)}`;
}
function escapeSsmlText(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function normalizeEdgeVoice(voice) {
  const value = typeof voice === "string" ? voice.trim() : "";
  return /^[A-Za-z]{2,3}-[A-Za-z]{2,3}-[A-Za-z0-9]+Neural$/.test(value) ? value : DEFAULT_VOICE;
}
function clampProsodyValue(value, fallback) {
  const str = typeof value === "string" ? value.trim() : "";
  return /^(default|[+-]?\d{1,3}%|[+-]?\d{1,3}(\.\d+)?)$/.test(str) ? str : fallback;
}
function buildSsml(input) {
  const voice = normalizeEdgeVoice(input.voice);
  const rate = clampProsodyValue(input.rate, "default");
  const pitch = clampProsodyValue(input.pitch, "default");
  const volume = clampProsodyValue(input.volume, "default");
  const text = escapeSsmlText(input.text);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody rate='${rate}' pitch='${pitch}' volume='${volume}'>${text}</prosody></voice></speak>`;
}
function buildSsmlMessage(requestId, ssml, timestamp = toIsoTimestamp()) {
  return `X-RequestId:${requestId}\r
Content-Type:application/ssml+xml\r
X-Timestamp:${timestamp}\r
Path:ssml\r
\r
${ssml}`;
}
function isTurnEndMessage(message) {
  return typeof message === "string" && message.includes("Path:turn.end");
}
function demuxAudioChunk(frame) {
  if (!Buffer.isBuffer(frame) || frame.length < 2) return null;
  const headerLength = frame.readUInt16BE(0);
  if (2 + headerLength > frame.length) return null;
  const headers = frame.subarray(2, 2 + headerLength).toString("ascii");
  const audio = frame.subarray(2 + headerLength);
  return { headers, audio };
}
function buildEdgeTtsWsUrl(nowMs = Date.now()) {
  const params = new URLSearchParams({
    TrustedClientToken: resolvePublicCred("edgetts_token"),
    "Sec-MS-GEC": computeSecMsGec(nowMs),
    "Sec-MS-GEC-Version": EDGE_TTS_GEC_VERSION,
    ConnectionId: buildConnectionId()
  });
  return `${EDGE_TTS_WS_URL}?${params.toString()}`;
}
async function synthesizeEdgeTts(input, WebSocketCtor) {
  const Ctor = WebSocketCtor ?? (await import("ws")).default;
  const url = buildEdgeTtsWsUrl();
  const ssml = buildSsml(input);
  const requestId = buildConnectionId();
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    let contentType = "audio/mpeg";
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => {
        try {
          ws.close();
        } catch {
        }
        reject(new Error("EdgeTTS synthesis timed out"));
      });
    }, SYNTH_TIMEOUT_MS);
    let ws;
    try {
      ws = new Ctor(url, { handshakeTimeout: CONNECT_TIMEOUT_MS });
    } catch (err) {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    ws.on("open", () => {
      ws.send(buildSpeechConfigMessage());
      ws.send(buildSsmlMessage(requestId, ssml));
    });
    ws.on("message", (data, isBinary) => {
      const binary = isBinary === true || Buffer.isBuffer(data);
      if (binary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const demuxed = demuxAudioChunk(buf);
        if (demuxed) {
          const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(demuxed.headers);
          if (typeMatch) contentType = typeMatch[1].trim();
          if (demuxed.audio.length > 0) chunks.push(demuxed.audio);
        }
        return;
      }
      const text = String(data);
      if (isTurnEndMessage(text)) {
        finish(() => {
          try {
            ws.close();
          } catch {
          }
          resolve({ audio: Buffer.concat(chunks), contentType });
        });
      }
    });
    ws.on("error", (err) => {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
    ws.on("close", () => {
      finish(() => {
        if (chunks.length > 0) {
          resolve({ audio: Buffer.concat(chunks), contentType });
        } else {
          reject(new Error("EdgeTTS connection closed before receiving audio"));
        }
      });
    });
  });
}
async function handleEdgeTtsSpeech(body, clientIp, WebSocketCtor) {
  if (clientIp) {
    const { allowed, retryAfterMs } = edgeTtsLimiter.tryAcquire(clientIp, EDGE_TTS_RATE_WINDOW);
    if (!allowed) {
      return errorResponse(
        429,
        `EdgeTTS rate limit exceeded, retry after ${Math.ceil(retryAfterMs / 1e3)}s`
      );
    }
  }
  const text = typeof body?.input === "string" ? body.input : "";
  if (!text.trim()) {
    return errorResponse(400, "input is required");
  }
  try {
    const { audio, contentType } = await synthesizeEdgeTts(
      {
        text,
        voice: typeof body.voice === "string" ? body.voice : void 0
      },
      WebSocketCtor
    );
    return new Response(audio, {
      status: 200,
      headers: { "Content-Type": contentType }
    });
  } catch (err) {
    return errorResponse(
      502,
      `EdgeTTS request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
export {
  buildConnectionId,
  buildEdgeTtsWsUrl,
  buildSpeechConfigMessage,
  buildSsml,
  buildSsmlMessage,
  computeSecMsGec,
  demuxAudioChunk,
  escapeSsmlText,
  handleEdgeTtsSpeech,
  isTurnEndMessage,
  normalizeEdgeVoice,
  synthesizeEdgeTts
};
