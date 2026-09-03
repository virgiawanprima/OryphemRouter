// ADAPTATION for OryphemRouter.
// OmniRoute's compression subsystem uses the `@toon-format/toon` npm package (a lossy
// text-compression codec) in `compression/engines/headroom/toon.ts`. That package is not
// installed in OryphemRouter. This shim provides a lossless no-op fallback: encode returns
// the input unchanged (as a string) and decode reverses it, so the headroom engine keeps
// working without the codec.

export function encode(input) {
  if (Array.isArray(input)) return JSON.stringify(input);
  if (typeof input === "string") return input;
  return String(input ?? "");
}

export function decode(input) {
  if (typeof input !== "string") return input;
  const trimmed = input.trim();
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  return input;
}

export default { encode, decode };
