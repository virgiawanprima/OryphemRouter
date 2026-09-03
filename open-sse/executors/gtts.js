const GOOGLE_TTS_MAX_CHARS = 100;
const GTTS_RPC_ID = "jQ1olc";
const GTTS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const GTTS_REFERER = "http://translate.google.com/";
const DEFAULT_LANG = "en";
const DEFAULT_TLD = "com";
const LANG_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
class GttsUpstreamError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.name = "GttsUpstreamError";
    this.status = status;
  }
}
function normalizeGttsLang(lang) {
  const value = typeof lang === "string" ? lang.trim() : "";
  return LANG_PATTERN.test(value) ? value : DEFAULT_LANG;
}
function chunkGttsText(text, maxChars = GOOGLE_TTS_MAX_CHARS) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];
  const chunks = [];
  let remaining = trimmed;
  while (remaining.length > maxChars) {
    let splitAt = -1;
    for (let i = maxChars; i > 0; i--) {
      if (/\s/.test(remaining[i])) {
        splitAt = i;
        break;
      }
    }
    if (splitAt <= 0) splitAt = maxChars;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter((c) => c.length > 0);
}
function buildGttsRpcBody(text, lang) {
  const innerPayload = JSON.stringify([text, lang, true, "null"]);
  const envelope = [[[GTTS_RPC_ID, innerPayload, null, "generic"]]];
  return `f.req=${encodeURIComponent(JSON.stringify(envelope))}&`;
}
function extractAudioFromWrbFrEntry(entry) {
  if (!Array.isArray(entry) || entry[0] !== "wrb.fr" || entry[1] !== GTTS_RPC_ID) return null;
  if (typeof entry[2] !== "string") return null;
  try {
    const inner = JSON.parse(entry[2]);
    if (Array.isArray(inner) && typeof inner[0] === "string" && inner[0].length > 0) {
      return inner[0];
    }
  } catch {
  }
  return null;
}
function findAudioInBatchExecuteLine(line) {
  let outer;
  try {
    outer = JSON.parse(line);
  } catch {
    return null;
  }
  if (!Array.isArray(outer)) return null;
  for (const entry of outer) {
    const audio = extractAudioFromWrbFrEntry(entry);
    if (audio) return audio;
  }
  return null;
}
function parseBatchExecuteResponse(raw) {
  const cleaned = typeof raw === "string" ? raw.replace(/^\)\]\}'\n?/, "") : "";
  const lines = cleaned.split("\n").filter((line) => {
    const trimmedLine = line.trim();
    return trimmedLine.length > 0 && !/^\d+$/.test(trimmedLine);
  });
  for (const line of lines) {
    const audio = findAudioInBatchExecuteLine(line);
    if (audio) return audio;
  }
  throw new GttsUpstreamError(502, "gTTS response did not contain audio data");
}
async function synthesizeGttsChunk(chunk, lang, tld, fetchImpl) {
  const body = buildGttsRpcBody(chunk, lang);
  const res = await fetchImpl(
    `https://translate.google.${tld}/_/TranslateWebserverUi/data/batchexecute`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        "User-Agent": GTTS_USER_AGENT,
        Referer: GTTS_REFERER
      },
      body
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new GttsUpstreamError(res.status, errText || `gTTS upstream error (${res.status})`);
  }
  const raw = await res.text();
  const base64Audio = parseBatchExecuteResponse(raw);
  return Buffer.from(base64Audio, "base64");
}
async function synthesizeGtts(input, fetchImpl = fetch) {
  const lang = normalizeGttsLang(input.lang);
  const tld = typeof input.tld === "string" && input.tld.trim() || DEFAULT_TLD;
  const chunks = chunkGttsText(input.text);
  if (chunks.length === 0) {
    throw new GttsUpstreamError(400, "gTTS requires non-empty input text");
  }
  const buffers = [];
  for (const chunk of chunks) {
    buffers.push(await synthesizeGttsChunk(chunk, lang, tld, fetchImpl));
  }
  return Buffer.concat(buffers);
}
export {
  GOOGLE_TTS_MAX_CHARS,
  GttsUpstreamError,
  buildGttsRpcBody,
  chunkGttsText,
  normalizeGttsLang,
  parseBatchExecuteResponse,
  synthesizeGtts
};
