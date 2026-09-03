// Minimal self-contained adaptation of OmniRoute utils/stream.ts for
// OryphemRouter. The full stream.js in this project depends on @/lib/usageDb
// (not present in OryphemRouter), so this module provides a loadable
// `createSSETransformStreamWithLogger` that performs SSE chunk translation via
// the destination's translator/index.js. Logging/usage tracking are omitted.

import { translateResponse, initState } from "../../translator/index.js";

/**
 * Build a TransformStream that parses upstream SSE `data:` lines, translates
 * each chunk from `sourceFormat` to `targetFormat`, and re-emits SSE.
 * Accepts and ignores the extra logger/connection args for signature
 * compatibility with OmniRoute callers.
 */
export function createSSETransformStreamWithLogger(
  targetFormat,
  sourceFormat,
  provider = null,
  reqLogger = null,
  toolNameMap = null,
  model = null,
  connectionId = null,
  body = null,
  onStreamComplete = null,
  apiKey = null,
  customToolNames = null,
  ..._extra
) {
  void provider;
  void reqLogger;
  void toolNameMap;
  void model;
  void connectionId;
  void body;
  void apiKey;
  void customToolNames;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = initState(sourceFormat);
  let done = false;

  const emit = (controller, chunk) => {
    if (chunk === undefined || chunk === null) return;
    const line = typeof chunk === "string" ? chunk : JSON.stringify(chunk);
    controller.enqueue(encoder.encode(`data: ${line}\n\n`));
  };

  const flushTranslations = (controller) => {
    if (done) return;
    done = true;
    try {
      const flushed = translateResponse(targetFormat, sourceFormat, null, state);
      if (Array.isArray(flushed)) {
        for (const chunk of flushed) emit(controller, chunk);
      } else {
        emit(controller, flushed);
      }
    } catch {
      /* best-effort flush */
    }
    try {
      onStreamComplete?.();
    } catch {
      /* best-effort */
    }
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
  };

  const processLine = (controller, line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      flushTranslations(controller);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      emit(controller, data);
      return;
    }
    try {
      const translated = translateResponse(targetFormat, sourceFormat, parsed, state);
      if (Array.isArray(translated)) {
        for (const chunk of translated) emit(controller, chunk);
      } else if (translated !== undefined) {
        emit(controller, translated);
      }
    } catch {
      emit(controller, parsed);
    }
  };

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        processLine(controller, line);
      }
    },
    flush(controller) {
      if (buffer.trim()) processLine(controller, buffer.trim());
      if (!done) flushTranslations(controller);
    },
  });
}

/** Passthrough SSE transform (no translation). */
export function createPassthroughStreamWithLogger(..._args) {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
  });
}
