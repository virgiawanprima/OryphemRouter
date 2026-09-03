import { FORMATS } from "../../translator/formats.js";
function getSkillsProviderForFormat(format) {
  switch (format) {
    case FORMATS.CLAUDE:
      return "anthropic";
    case FORMATS.GEMINI:
      return "google";
    default:
      return "openai";
  }
}
function getSkillsModelIdForFormat(format) {
  switch (format) {
    case FORMATS.CLAUDE:
      return "claude";
    case FORMATS.GEMINI:
      return "gemini";
    default:
      return "openai";
  }
}
export {
  getSkillsModelIdForFormat,
  getSkillsProviderForFormat
};
