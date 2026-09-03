function buildSseChunk(data) {
  return `data: ${JSON.stringify(data)}

`;
}
function buildStreamingResponse(content, model, id, created) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          buildSseChunk({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
          })
        )
      );
      if (content) {
        controller.enqueue(
          encoder.encode(
            buildSseChunk({
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: { content }, finish_reason: null }]
            })
          )
        );
      }
      controller.enqueue(
        encoder.encode(
          buildSseChunk({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
          })
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}
function buildJsonCompletion(content, model, id, created) {
  const estimated = Math.max(1, Math.ceil(content.length / 4));
  return new Response(
    JSON.stringify({
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: estimated,
        completion_tokens: estimated,
        total_tokens: estimated * 2
      }
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
}
function buildToolJsonCompletion(message, finishReason, model, id, created) {
  const contentForEstimate = typeof message.content === "string" ? message.content : "";
  const estimated = Math.max(1, Math.ceil(contentForEstimate.length / 4));
  return new Response(
    JSON.stringify({
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: finishReason
        }
      ],
      usage: {
        prompt_tokens: estimated,
        completion_tokens: estimated,
        total_tokens: estimated * 2
      }
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
}
function buildToolStreamingResponse(message, finishReason, model, id, created) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          buildSseChunk({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
          })
        )
      );
      controller.enqueue(
        encoder.encode(
          buildSseChunk({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: message, finish_reason: null }]
          })
        )
      );
      controller.enqueue(
        encoder.encode(
          buildSseChunk({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: finishReason }]
          })
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}
export {
  buildJsonCompletion,
  buildStreamingResponse,
  buildToolJsonCompletion,
  buildToolStreamingResponse
};
