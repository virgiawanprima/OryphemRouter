const DEFAULT_MAX_LONG_EDGE = 2048;
let sharpPromise = null;
async function loadSharp() {
  if (!sharpPromise) {
    sharpPromise = import("sharp").then((m) => m.default ?? m).catch(() => null);
  }
  return sharpPromise;
}
async function normalizeImageBuffer(input, opts) {
  const maxLongEdge = opts?.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const sharp = await loadSharp();
  if (!sharp) return { buffer: input, mime: null, resized: false };
  try {
    const img = sharp(input, { failOn: "error" });
    const meta = await img.metadata();
    const long = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (!long || long <= maxLongEdge) {
      return { buffer: input, mime: meta.format ? `image/${meta.format}` : null, resized: false };
    }
    const buffer = await img.resize({ width: maxLongEdge, height: maxLongEdge, fit: "inside", withoutEnlargement: true }).toBuffer();
    return { buffer, mime: meta.format ? `image/${meta.format}` : null, resized: true };
  } catch {
    return { buffer: input, mime: null, resized: false };
  }
}
async function normalizeDataUri(dataUri, opts) {
  try {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUri);
    if (!match) return dataUri;
    const input = Buffer.from(match[2], "base64");
    if (!input.length) return dataUri;
    const out = await normalizeImageBuffer(input, opts);
    if (!out.resized) return dataUri;
    return `data:${match[1]};base64,${out.buffer.toString("base64")}`;
  } catch {
    return dataUri;
  }
}
export {
  normalizeDataUri,
  normalizeImageBuffer
};
