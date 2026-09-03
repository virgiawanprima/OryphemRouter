function createCostMeter(cap) {
  const bounded = typeof cap === "number" && cap > 0;
  let spent = 0;
  return {
    add(usd) {
      spent += Number.isFinite(usd) && usd > 0 ? usd : 0;
    },
    wouldExceed(usd) {
      if (!bounded) return false;
      return spent + (Number.isFinite(usd) && usd > 0 ? usd : 0) > cap;
    },
    get spent() {
      return spent;
    },
    get exceeded() {
      return bounded && spent > cap;
    }
  };
}
export {
  createCostMeter
};
