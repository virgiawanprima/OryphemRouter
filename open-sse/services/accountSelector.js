import { getAccountHealth } from "../utils/omni/accountFallbackExt.js";
import crypto from "crypto";
function selectAccountP2C(accounts, model = null) {
  if (!accounts || accounts.length === 0) return null;
  if (accounts.length === 1) return accounts[0];
  const i = crypto.randomInt(accounts.length);
  let j = crypto.randomInt(accounts.length - 1);
  if (j >= i) j++;
  const a = accounts[i];
  const b = accounts[j];
  const healthA = getAccountHealth(a, model);
  const healthB = getAccountHealth(b, model);
  return healthA >= healthB ? a : b;
}
function selectAccount(accounts, strategy = "fill-first", state = {}, model = null) {
  if (!accounts || accounts.length === 0) {
    return { account: null, state };
  }
  switch (strategy) {
    case "p2c":
      return { account: selectAccountP2C(accounts, model), state };
    case "random":
      return {
        account: accounts[crypto.randomInt(accounts.length)],
        state
      };
    case "round-robin": {
      const lastIndex = state.lastIndex ?? -1;
      const nextIndex = (lastIndex + 1) % accounts.length;
      return {
        account: accounts[nextIndex],
        state: { ...state, lastIndex: nextIndex }
      };
    }
    case "fill-first":
    default:
      return { account: accounts[0], state };
  }
}
export {
  selectAccount,
  selectAccountP2C
};
