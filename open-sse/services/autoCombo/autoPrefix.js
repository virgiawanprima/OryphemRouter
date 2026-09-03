const VALID_VARIANTS = [
  "coding",
  "fast",
  "cheap",
  "offline",
  "smart",
  "lkgp",
  "chaos"
];
function parseAutoPrefix(model) {
  if (typeof model !== "string") {
    return { valid: false, error: "Not an auto-prefixed model" };
  }
  if (!model.startsWith("auto")) {
    return { valid: false, error: "Not an auto-prefixed model" };
  }
  const parts = model.split("/");
  if (parts.length === 1) {
    if (parts[0] === "auto") {
      return { valid: true, variant: void 0 };
    } else {
      return { valid: false, error: "Invalid auto prefix format" };
    }
  }
  if (parts.length === 2) {
    if (parts[0] !== "auto") {
      return { valid: false, error: "Invalid auto prefix format" };
    }
    const variantStr = parts[1];
    if (variantStr === "" || VALID_VARIANTS.includes(variantStr)) {
      return { valid: true, variant: variantStr === "" ? void 0 : variantStr };
    } else {
      return { valid: false, error: `Invalid auto variant: ${variantStr}` };
    }
  }
  return { valid: false, error: "Invalid auto prefix format" };
}
export {
  VALID_VARIANTS,
  parseAutoPrefix
};
