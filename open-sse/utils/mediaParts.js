const MAX_DEPTH = 8;
function urlFrom(raw) {
  if (typeof raw === "string") return raw;
  const url = raw?.url;
  return typeof url === "string" ? url : void 0;
}
function pushPart(ctx, kind, ref, shape, depth) {
  ctx.out.push({
    kind,
    ref,
    messageIndex: ctx.messageIndex,
    partIndex: ctx.partIndex,
    nested: depth > 0,
    shape
  });
  if (ctx.stopAtKind === kind) ctx.found = true;
}
function inspectImageShapes(obj, type, ctx, depth) {
  if (type === "image_url" || type === "input_image") {
    const url = urlFrom(obj.image_url);
    if (url) {
      pushPart(ctx, "image", url, type === "input_image" ? "input_image" : "image_url", depth);
      return true;
    }
  }
  if (type === "image") {
    const source = obj.source;
    if (source?.type === "base64" && typeof source.data === "string") {
      const media = typeof source.media_type === "string" ? source.media_type : "image/png";
      pushPart(ctx, "image", `data:${media};base64,${source.data}`, "image_base64", depth);
      return true;
    }
    if (source?.type === "url" && typeof source.url === "string" && source.url) {
      pushPart(ctx, "image", source.url, "image_source_url", depth);
      return true;
    }
  }
  return false;
}
function inspectAudioShapes(obj, type, mediaType, ctx, depth) {
  if (type === "input_audio") {
    const audio = obj.input_audio;
    if (typeof audio?.data === "string") {
      pushPart(ctx, "audio", audio.data, "input_audio", depth);
      return true;
    }
  }
  if (type === "audio_url") {
    const url = urlFrom(obj.audio_url);
    if (url) {
      pushPart(ctx, "audio", url, "audio_url", depth);
      return true;
    }
  }
  if (typeof mediaType === "string" && mediaType.startsWith("audio/")) {
    const data = obj.source.data;
    if (typeof data === "string") {
      pushPart(ctx, "audio", data, "audio_source", depth);
      return true;
    }
  }
  return false;
}
function inspectVideoShapes(obj, type, mediaType, ctx, depth) {
  if (type === "input_video") {
    const ref = urlFrom(obj.video_url ?? obj.input_video ?? obj.url);
    if (ref) {
      pushPart(ctx, "video", ref, "input_video", depth);
      return true;
    }
  }
  if (type === "video_url") {
    const ref = urlFrom(obj.video_url);
    if (ref) {
      pushPart(ctx, "video", ref, "video_url", depth);
      return true;
    }
  }
  const source = obj.source;
  if (source) {
    const videoMediaType = typeof mediaType === "string" && mediaType.toLowerCase().startsWith("video/");
    if (videoMediaType && typeof source.data === "string") {
      pushPart(ctx, "video", `data:${mediaType};base64,${source.data}`, "video_source", depth);
      return true;
    }
    const ref = urlFrom(source.url);
    const explicitAnthropicUrl = type === "video" && source.type === "url";
    if (ref && (explicitAnthropicUrl || type === "video_source" || videoMediaType)) {
      pushPart(ctx, "video", ref, "video_source", depth);
      return true;
    }
  }
  return false;
}
function inspectImageIndicators(obj, type, mediaType, ctx, depth) {
  const lowerType = type?.toLowerCase();
  const looksLikeImage = lowerType === "image" || lowerType === "image_url" || lowerType === "input_image" || "image_url" in obj || "input_image" in obj;
  const imageMediaType = typeof mediaType === "string" && mediaType.toLowerCase().startsWith("image/");
  if (!looksLikeImage && !imageMediaType) return false;
  pushPart(ctx, "image", urlFrom(obj.image_url ?? obj.input_image) ?? "", "image_indicator", depth);
  return true;
}
function inspect(value, ctx, depth) {
  if (ctx.found || depth > MAX_DEPTH || value == null) return;
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) pushPart(ctx, "image", value, "data_uri_string", depth);
    if (value.startsWith("data:video/")) pushPart(ctx, "video", value, "data_uri_string", depth);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      inspect(entry, ctx, depth + 1);
      if (ctx.found) return;
    }
    return;
  }
  if (typeof value !== "object") return;
  const obj = value;
  const type = typeof obj.type === "string" ? obj.type : void 0;
  if (inspectImageShapes(obj, type, ctx, depth)) return;
  const mediaType = obj.source?.media_type;
  inspectAudioShapes(obj, type, mediaType, ctx, depth);
  if (ctx.found) return;
  if (inspectVideoShapes(obj, type, mediaType, ctx, depth)) return;
  if (inspectImageIndicators(obj, type, mediaType, ctx, depth)) return;
  for (const nested of Object.values(obj)) {
    inspect(nested, ctx, depth + 1);
    if (ctx.found) return;
  }
}
function detectMediaParts(messages) {
  const out = [];
  if (!Array.isArray(messages)) return out;
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const content = messages[messageIndex]?.content;
    if (!Array.isArray(content)) continue;
    for (let partIndex = 0; partIndex < content.length; partIndex++) {
      inspect(content[partIndex], { out, messageIndex, partIndex }, 0);
    }
  }
  return out;
}
function containsMediaKind(messages, kind) {
  if (!Array.isArray(messages)) return false;
  const out = [];
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const content = messages[messageIndex]?.content;
    if (!Array.isArray(content)) continue;
    for (let partIndex = 0; partIndex < content.length; partIndex++) {
      const ctx = { out, messageIndex, partIndex, stopAtKind: kind };
      inspect(content[partIndex], ctx, 0);
      if (ctx.found) return true;
    }
  }
  return false;
}
export {
  containsMediaKind,
  detectMediaParts
};
