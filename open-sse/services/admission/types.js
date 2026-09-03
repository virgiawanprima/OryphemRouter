const MAX_ADMISSION_WINDOW_MS = 864e5;
const MAX_ADMISSION_COST_OR_LIMIT = Math.floor(
  Number.MAX_SAFE_INTEGER / MAX_ADMISSION_WINDOW_MS
);
function createAdmissionRejectError(code, message) {
  const err = new Error(message);
  err.name = "AdmissionRejectError";
  err.code = code;
  return err;
}
export {
  MAX_ADMISSION_COST_OR_LIMIT,
  MAX_ADMISSION_WINDOW_MS,
  createAdmissionRejectError
};
