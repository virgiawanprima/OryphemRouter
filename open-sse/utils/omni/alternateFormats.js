function resolveAlternateFormat(entry, providerSpecificData) {
  const alternates = entry?.alternateFormats;
  if (!alternates?.length) return null;
  const requested = providerSpecificData?.targetFormat;
  if (typeof requested !== "string" || !requested) return null;
  return alternates.find((alt) => alt.format === requested) ?? null;
}
export {
  resolveAlternateFormat
};
