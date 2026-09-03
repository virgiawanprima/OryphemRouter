import { createHash } from "node:crypto";
const FINGERPRINT_SALT = "59cf53e54c78";
function computeFingerprint(firstUserMessageText, version) {
  const indices = [4, 7, 20];
  const chars = indices.map((i) => firstUserMessageText[i] || "0").join("");
  const input = `${FINGERPRINT_SALT}${chars}${version}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return hash.slice(0, 3);
}
function extractFirstUserMessageText(messages) {
  if (!Array.isArray(messages)) return "";
  for (const msg of messages) {
    if (String(msg?.role).toLowerCase() !== "user") continue;
    const content = msg?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
          return block.text;
        }
      }
    }
    return "";
  }
  return "";
}
export {
  computeFingerprint,
  extractFirstUserMessageText
};
