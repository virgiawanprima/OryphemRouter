const ESTIMATE_SIZE_BYTE_LIMIT = 262144;
const ESTIMATE_SIZE_NODE_BUDGET = 16384;
function ownEnumerableKeyIterator(obj) {
  return function* ownEnumerableKeys() {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        yield key;
      }
    }
  }();
}
function addPrimitiveBytes(bytes, v) {
  if (typeof v === "string") return bytes + v.length;
  if (typeof v === "number") return bytes + 8;
  return bytes + 4;
}
function enqueueContainer(stack, obj, seen) {
  if (seen.has(obj)) return;
  seen.add(obj);
  if (Array.isArray(obj)) {
    if (obj.length > 0) stack.push({ t: "a", a: obj, i: 0 });
    return;
  }
  stack.push({ t: "o", o: obj, it: ownEnumerableKeyIterator(obj) });
}
function isValueFrame(frame) {
  return frame.t === "v";
}
function expandContainerFrame(stack, frame) {
  if (frame.t === "a") {
    if (frame.i >= frame.a.length) return;
    if (frame.i + 1 < frame.a.length) {
      stack.push({ t: "a", a: frame.a, i: frame.i + 1 });
    }
    stack.push({ t: "v", v: frame.a[frame.i] });
    return;
  }
  const next = frame.it.next();
  if (next.done) return;
  stack.push(frame);
  stack.push({ t: "v", v: frame.o[next.value] });
}
function estimateSizeFast(value, byteLimit = ESTIMATE_SIZE_BYTE_LIMIT) {
  let bytes = 0;
  let visitsLeft = ESTIMATE_SIZE_NODE_BUDGET;
  const seen = /* @__PURE__ */ new WeakSet();
  const stack = [{ t: "v", v: value }];
  while (stack.length > 0) {
    if (visitsLeft <= 0) return byteLimit + 1;
    const frame = stack.pop();
    if (!isValueFrame(frame)) {
      expandContainerFrame(stack, frame);
      continue;
    }
    visitsLeft -= 1;
    const v = frame.v;
    if (v === null || v === void 0) continue;
    const ty = typeof v;
    if (ty === "string" || ty === "number" || ty === "boolean") {
      bytes = addPrimitiveBytes(bytes, v);
      if (bytes > byteLimit) return bytes;
      continue;
    }
    if (ty === "object") {
      enqueueContainer(stack, v, seen);
    }
  }
  return bytes;
}
function isSmallEnoughForSemanticCache(value) {
  return estimateSizeFast(value) <= 256 * 1024;
}
export {
  ESTIMATE_SIZE_BYTE_LIMIT,
  ESTIMATE_SIZE_NODE_BUDGET,
  estimateSizeFast,
  isSmallEnoughForSemanticCache
};
