/**
 * Pure Gemini-inline-audio helpers (OryphemRouter adaptation).
 *
 * NOTE: These three functions are verbatim ports of the pure audio-parsing
 * helpers from OmniRoute `open-sse/executors/vertexMedia.ts`, extracted here so
 * `geminiTts.js` does not depend on the (independently adapted) `vertexMedia.js`
 * file, whose Vertex auth/network functions are stubbed out in OryphemRouter.
 * `extractInlineAudio`, `parsePcmSampleRate` and `pcmToWav` are dependency-free
 * (no Vertex auth needed) and are the only vertexMedia helpers `geminiTts.js`
 * calls. They are duplicated here intentionally to keep `geminiTts.js` loadable
 * regardless of how `vertexMedia.js` evolves.
 */

import { Buffer } from "node:buffer";

/** Wrap raw little-endian 16-bit PCM mono samples in a minimal WAV container. */
export function pcmToWav(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Parse the sample rate out of a `audio/L16;rate=NNNN` mimeType (default 24000). */
export function parsePcmSampleRate(mimeType) {
  if (!mimeType) return 24000;
  const match = /rate=(\d+)/i.exec(mimeType);
  return match ? parseInt(match[1], 10) : 24000;
}

/** Extract the first inline-audio part from a Gemini generateContent response. */
export function extractInlineAudio(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = part?.inlineData;
    if (inline && typeof inline.data === "string" && inline.data.length > 0) {
      return {
        base64: inline.data,
        mimeType: typeof inline.mimeType === "string" ? inline.mimeType : "audio/L16;rate=24000",
      };
    }
  }
  return null;
}
