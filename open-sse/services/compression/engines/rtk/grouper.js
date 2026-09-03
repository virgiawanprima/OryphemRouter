function normalizeLine(line) {
  let s = line;
  s = s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, "<N>");
  s = s.replace(/\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]/g, "[<N>]");
  s = s.replace(/\b[0-9a-fA-F]{6,40}\b/g, "<N>");
  s = s.replace(/\bv?\d+\.\d+\.\d+(?:\.\d+)*\b/g, "<N>");
  s = s.replace(/\b\d+\b/g, "<N>");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}
function groupSimilarLines(text, options = {}) {
  const threshold = Math.max(2, Math.floor(options.threshold ?? 3));
  const lines = text.split(/\r?\n/);
  const output = [];
  let grouped = 0;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const normalised = normalizeLine(line);
    let runLength = 1;
    while (index + runLength < lines.length && normalizeLine(lines[index + runLength]) === normalised) {
      runLength++;
    }
    if (runLength >= threshold) {
      output.push(`${line} [rtk:grouped \xD7${runLength}]`);
      grouped += runLength - 1;
      index += runLength;
    } else {
      output.push(line);
      index++;
    }
  }
  return { text: output.join("\n"), grouped };
}
export {
  groupSimilarLines,
  normalizeLine
};
