// ADAPTED STUB (mapImageSize from translator/image/sizeMapper.ts).
export function mapImageSize(size, fallback = "1024x1024") {
  if (typeof size === "string" && size.trim()) return size.trim();
  return fallback;
}
export default mapImageSize;
