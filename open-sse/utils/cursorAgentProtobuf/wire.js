const WT_VARINT = 0;
const WT_LEN = 2;
function encodeVarint(value) {
  let v = typeof value === "bigint" ? value : BigInt(value);
  const bytes = [];
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 128);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}
function encodeTag(fieldNumber, wireType) {
  return encodeVarint(fieldNumber << 3 | wireType);
}
function encodeBytes(fieldNumber, value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([encodeTag(fieldNumber, WT_LEN), encodeVarint(buf.length), buf]);
}
function encodeString(fieldNumber, value) {
  return encodeBytes(fieldNumber, Buffer.from(value, "utf8"));
}
function encodeMessage(fieldNumber, parts) {
  const inner = Buffer.concat(parts);
  return Buffer.concat([encodeTag(fieldNumber, WT_LEN), encodeVarint(inner.length), inner]);
}
function encodeUInt32Field(fieldNumber, value) {
  return Buffer.concat([encodeTag(fieldNumber, WT_VARINT), encodeVarint(value)]);
}
function encodeBoolField(fieldNumber, value) {
  return Buffer.concat([encodeTag(fieldNumber, WT_VARINT), encodeVarint(value ? 1 : 0)]);
}
function encodeDoubleField(fieldNumber, value) {
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(value, 0);
  return Buffer.concat([encodeTag(fieldNumber, 1), buf]);
}
function decodeVarint(buf, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos++];
    result |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) return [result, pos];
    shift += 7n;
  }
  throw new Error("varint truncated");
}
function checkedLen(len, pos, buf) {
  if (len < 0n || len > BigInt(buf.length - pos)) {
    throw new Error(
      `length-delimited field overruns buffer (len=${len}, remaining=${buf.length - pos})`
    );
  }
  return Number(len);
}
function decodeFields(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    const [tag, np] = decodeVarint(buf, pos);
    pos = np;
    const fieldNumber = Number(tag >> 3n);
    const wireType = Number(tag & 0x7n);
    if (wireType === WT_VARINT) {
      const [v, np2] = decodeVarint(buf, pos);
      pos = np2;
      fields.push({ fieldNumber, wireType: 0, varint: v });
    } else if (wireType === WT_LEN) {
      const [len, np2] = decodeVarint(buf, pos);
      pos = np2;
      const lenN = checkedLen(len, pos, buf);
      fields.push({ fieldNumber, wireType: 2, bytes: buf.subarray(pos, pos + lenN) });
      pos += lenN;
    } else if (wireType === 5) {
      pos += 4;
    } else if (wireType === 1) {
      pos += 8;
    } else {
      throw new Error(`unsupported wireType ${wireType}`);
    }
  }
  return fields;
}
function findField(fields, fieldNumber) {
  return fields.find((f) => f.fieldNumber === fieldNumber);
}
function decodeStringField(buf, fieldNumber) {
  const fields = decodeFields(buf);
  const f = findField(fields, fieldNumber);
  if (f && f.wireType === 2) return f.bytes.toString("utf8");
  return "";
}
function decodeVarintField(buf, fieldNumber) {
  const fields = decodeFields(buf);
  const f = findField(fields, fieldNumber);
  if (f && f.wireType === 0) return Number(f.varint);
  return 0;
}
export {
  WT_LEN,
  WT_VARINT,
  checkedLen,
  decodeFields,
  decodeStringField,
  decodeVarint,
  decodeVarintField,
  encodeBoolField,
  encodeBytes,
  encodeDoubleField,
  encodeMessage,
  encodeString,
  encodeTag,
  encodeUInt32Field,
  encodeVarint,
  findField
};
