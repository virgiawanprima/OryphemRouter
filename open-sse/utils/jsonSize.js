function encodedStringLength(value) {
  let len = 2;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 34 || code === 92) {
      len += 2;
    } else if (code === 8 || code === 9 || code === 10 || code === 12 || code === 13) {
      len += 2;
    } else if (code < 32) {
      len += 6;
    } else if (code >= 55296 && code <= 57343) {
      const isHigh = code <= 56319;
      const next = isHigh ? value.charCodeAt(i + 1) : NaN;
      const paired = isHigh && next >= 56320 && next <= 57343;
      if (paired) {
        len += 2;
        i++;
      } else {
        len += 6;
      }
    } else {
      len += 1;
    }
  }
  return len;
}
function isOmitted(value) {
  return value === void 0 || typeof value === "function" || typeof value === "symbol";
}
function isPlainContainer(value) {
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function jsonLength(value) {
  return lengthOf(value, /* @__PURE__ */ new Set());
}
function lengthOf(value, seen) {
  if (value === null) return 4;
  const type = typeof value;
  if (type === "string") return encodedStringLength(value);
  if (type === "boolean") return value ? 4 : 5;
  if (type === "number") {
    return Number.isFinite(value) ? String(value).length : 4;
  }
  if (type === "bigint") {
    throw new TypeError("Do not know how to serialize a BigInt");
  }
  if (isOmitted(value)) return 0;
  if (type !== "object") return 0;
  const obj = value;
  if (!isPlainContainer(obj) || typeof obj.toJSON === "function") {
    const encoded = JSON.stringify(obj);
    return encoded === void 0 ? 0 : encoded.length;
  }
  if (seen.has(obj)) {
    throw new TypeError("Converting circular structure to JSON");
  }
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      let len2 = 2;
      for (let i = 0; i < obj.length; i++) {
        if (i > 0) len2 += 1;
        const item = obj[i];
        len2 += isOmitted(item) ? 4 : lengthOf(item, seen);
      }
      return len2;
    }
    let len = 2;
    let first = true;
    for (const key of Object.keys(obj)) {
      const item = obj[key];
      if (isOmitted(item)) continue;
      if (!first) len += 1;
      first = false;
      len += encodedStringLength(key) + 1 + lengthOf(item, seen);
    }
    return len;
  } finally {
    seen.delete(obj);
  }
}
export {
  jsonLength
};
