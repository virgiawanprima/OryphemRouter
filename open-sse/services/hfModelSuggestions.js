const SUGGESTED_MODEL_KIND_PIPELINE_TAGS = {
  image: "text-to-image"
};
function resolveHfPipelineTag(kind) {
  return SUGGESTED_MODEL_KIND_PIPELINE_TAGS[kind] ?? null;
}
function sortHfSuggestedModels(models, sortBy = "downloads", limit = 20) {
  const valid = (models ?? []).filter(
    (m) => !!m && typeof m.id === "string" && m.id.trim().length > 0
  );
  const sorted = [...valid].sort((a, b) => {
    const bVal = Number(b[sortBy]);
    const aVal = Number(a[sortBy]);
    return (Number.isFinite(bVal) ? bVal : 0) - (Number.isFinite(aVal) ? aVal : 0);
  });
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
  return sorted.slice(0, safeLimit);
}
export {
  SUGGESTED_MODEL_KIND_PIPELINE_TAGS,
  resolveHfPipelineTag,
  sortHfSuggestedModels
};
