function collectionNames(collection) {
  const items = Array.isArray(collection) ? collection : Object.values(collection);
  return items.map((item) => item.name);
}
function countUniqueMcpTools(collectionsByLabel) {
  const uniqueNames = /* @__PURE__ */ new Set();
  for (const collection of Object.values(collectionsByLabel)) {
    for (const name of collectionNames(collection)) {
      uniqueNames.add(name);
    }
  }
  return uniqueNames.size;
}
export {
  countUniqueMcpTools
};
