import { runCompressionEval } from "./runner.js";
import { extractTextContent } from "../messageContent.js";
function transcriptsToCorpus(transcripts) {
  const corpus = [];
  for (const transcript of transcripts) {
    transcript.turns.forEach((turn, index) => {
      if (turn.content?.trim()) {
        corpus.push({ id: `${transcript.id}#${index}`, input: turn.content, task: transcript.id });
      }
    });
  }
  return corpus;
}
function replayTranscripts(transcripts, compress) {
  return runCompressionEval(transcriptsToCorpus(transcripts), compress);
}
function requestBodyToTranscript(id, body) {
  const messages = body && typeof body === "object" && Array.isArray(body.messages) ? body.messages : [];
  const turns = messages.map((message) => ({
    role: typeof message.role === "string" ? message.role : "user",
    content: extractTextContent(message.content)
  }));
  return { id, turns };
}
function requestBodiesToTranscripts(entries) {
  return entries.map((entry) => requestBodyToTranscript(entry.id, entry.body));
}
export {
  replayTranscripts,
  requestBodiesToTranscripts,
  requestBodyToTranscript,
  transcriptsToCorpus
};
