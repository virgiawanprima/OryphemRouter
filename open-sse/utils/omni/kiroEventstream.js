import { log as engineLog, sanitize } from "../log.js";
class ByteQueue {
  chunks = [];
  headOffset = 0;
  length = 0;
  push(chunk) {
    if (!(chunk instanceof Uint8Array) || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.length += chunk.length;
  }
  peekUint32BE(offset = 0) {
    if (this.length < offset + 4) return null;
    let value = 0;
    for (let i = 0; i < 4; i++) {
      value = value << 8 | this.byteAt(offset + i);
    }
    return value >>> 0;
  }
  read(length) {
    if (length < 0 || this.length < length) return null;
    const output = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      const head = this.chunks[0];
      const available = head.length - this.headOffset;
      const take = Math.min(available, length - written);
      output.set(head.subarray(this.headOffset, this.headOffset + take), written);
      written += take;
      this.headOffset += take;
      this.length -= take;
      if (this.headOffset >= head.length) {
        this.chunks.shift();
        this.headOffset = 0;
      }
    }
    return output;
  }
  byteAt(offset) {
    let remaining = offset;
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const start = i === 0 ? this.headOffset : 0;
      const available = chunk.length - start;
      if (remaining < available) {
        return chunk[start + remaining];
      }
      remaining -= available;
    }
    return 0;
  }
}
const CRC32_TABLE = new Uint32Array(256);
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}
const KIRO_VERIFY_FULL_CRC = process.env.KIRO_VERIFY_FULL_CRC === "true";
function crc32(buf) {
  let crc = 4294967295;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 255] ^ crc >>> 8;
  }
  return (crc ^ 4294967295) >>> 0;
}
function parseEventFrame(data) {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    const totalLength = view.getUint32(0, false);
    const headersLength = view.getUint32(4, false);
    const preludeCRC = view.getUint32(8, false);
    const computedPreludeCRC = crc32(data.slice(0, 8));
    if (preludeCRC !== computedPreludeCRC) {
      engineLog.warn(
        "KIRO",
        `Prelude CRC mismatch: expected ${preludeCRC}, got ${computedPreludeCRC} \u2014 skipping corrupted frame`
      );
      return null;
    }
    if (KIRO_VERIFY_FULL_CRC) {
      const messageCRC = view.getUint32(data.length - 4, false);
      const computedMessageCRC = crc32(data.slice(0, data.length - 4));
      if (messageCRC !== computedMessageCRC) {
        engineLog.warn(
          "KIRO",
          `Message CRC mismatch: expected ${messageCRC}, got ${computedMessageCRC} \u2014 skipping corrupted frame`
        );
        return null;
      }
    }
    const headers = {};
    let offset = 12;
    const headerEnd = 12 + headersLength;
    while (offset < headerEnd && offset < data.length) {
      const nameLen = data[offset];
      offset++;
      if (offset + nameLen > data.length) break;
      const name = TEXT_DECODER.decode(data.subarray(offset, offset + nameLen));
      offset += nameLen;
      const headerType = data[offset];
      offset++;
      if (headerType === 7) {
        const valueLen = data[offset] << 8 | data[offset + 1];
        offset += 2;
        if (offset + valueLen > data.length) break;
        const value = TEXT_DECODER.decode(data.subarray(offset, offset + valueLen));
        offset += valueLen;
        headers[name] = value;
      } else {
        break;
      }
    }
    const payloadStart = 12 + headersLength;
    const payloadEnd = data.length - 4;
    let payload = null;
    if (payloadEnd > payloadStart) {
      const payloadStr = TEXT_DECODER.decode(data.subarray(payloadStart, payloadEnd));
      if (!payloadStr || !payloadStr.trim()) {
        return { headers, payload: null };
      }
      try {
        payload = JSON.parse(payloadStr);
      } catch (parseError) {
        const err = parseError instanceof Error ? parseError : new Error(String(parseError));
        engineLog.warn(
          "KIRO",
          `Failed to parse payload: ${err.message} | payload: ${sanitize(payloadStr.substring(0, 100))}`
        );
        payload = { raw: payloadStr };
      }
    }
    return { headers, payload };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    engineLog.warn("KIRO", `Frame parse error: ${sanitize(error.message)}`);
    return null;
  }
}
export {
  ByteQueue,
  CRC32_TABLE,
  KIRO_VERIFY_FULL_CRC,
  TEXT_DECODER,
  TEXT_ENCODER,
  crc32,
  parseEventFrame
};
