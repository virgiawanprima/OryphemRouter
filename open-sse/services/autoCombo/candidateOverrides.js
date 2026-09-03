function filterExcludedCandidates(pool, excludedConnectionIds) {
  if (!excludedConnectionIds || excludedConnectionIds.size === 0) return pool;
  return pool.flatMap((candidate) => {
    if (Array.isArray(candidate.allowedConnectionIds)) {
      const allowedConnectionIds = candidate.allowedConnectionIds.filter(
        (connectionId) => !excludedConnectionIds.has(connectionId)
      );
      if (allowedConnectionIds.length === 0) return [];
      if (allowedConnectionIds.length === candidate.allowedConnectionIds.length) {
        return [candidate];
      }
      return [{ ...candidate, allowedConnectionIds }];
    }
    return candidate.connectionId && excludedConnectionIds.has(candidate.connectionId) ? [] : [candidate];
  });
}
export {
  filterExcludedCandidates
};
