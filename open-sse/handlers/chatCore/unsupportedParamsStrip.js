import { flattenToolHistory } from "../../utils/flattenToolHistory.js";
function stripUnsupportedParams(body, unsupported) {
  const strippedParams = [];
  for (const param of unsupported) {
    if (Object.hasOwn(body, param)) {
      strippedParams.push(param);
      delete body[param];
    }
  }
  if (unsupported.includes("tools") && Array.isArray(body.messages)) {
    body.messages = flattenToolHistory(body.messages);
  }
  return { strippedParams };
}
export {
  stripUnsupportedParams
};
