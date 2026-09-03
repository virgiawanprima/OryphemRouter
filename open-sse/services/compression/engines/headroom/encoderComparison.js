import { encodeTabularBlock, wrapTabular } from "./tabular.js";
import { encodeToonBlock, wrapToon } from "./toon.js";
import { collectCompactableArrays } from "./smartcrusher.js";
const ZERO = { bytes: 0, tokens: 0 };
function add(a, text, countTokens) {
  return { bytes: a.bytes + Buffer.byteLength(text, "utf8"), tokens: a.tokens + countTokens(text) };
}
function pickWinner(json, gcf, toon, toonAvailable) {
  const candidates = [
    ["gcf", gcf],
    ["json", json]
  ];
  if (toonAvailable) candidates.push(["toon", toon]);
  candidates.sort((a, b) => a[1].tokens - b[1].tokens || a[1].bytes - b[1].bytes);
  return candidates[0][0];
}
function summarizeEncoderCandidates(messages, minRows, countTokens) {
  const arrays = collectCompactableArrays(messages, minRows);
  let json = { ...ZERO }, gcf = { ...ZERO }, toon = { ...ZERO };
  let toonAvailable = arrays.length > 0;
  for (const arr of arrays) {
    json = add(json, JSON.stringify(arr), countTokens);
    gcf = add(gcf, wrapTabular(encodeTabularBlock(arr)), countTokens);
    const toonInner = encodeToonBlock(arr);
    if (toonInner === null) toonAvailable = false;
    else toon = add(toon, wrapToon(toonInner), countTokens);
  }
  return {
    arraysCompared: arrays.length,
    json,
    gcf,
    toon: toonAvailable ? toon : { ...ZERO },
    toonAvailable,
    winner: pickWinner(json, gcf, toon, toonAvailable)
  };
}
export {
  summarizeEncoderCandidates
};
