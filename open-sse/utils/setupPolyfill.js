import worker_threads from "node:worker_threads";
import { AsyncLocalStorage } from "node:async_hooks";
import { WebSocket } from "ws";
if (typeof globalThis.AsyncLocalStorage === "undefined") {
  Object.defineProperty(globalThis, "AsyncLocalStorage", {
    configurable: true,
    value: AsyncLocalStorage,
    writable: true
  });
}
if (worker_threads && !worker_threads.markAsUncloneable) {
  worker_threads.markAsUncloneable = function(obj) {
    if (worker_threads.markAsUntransferable) {
      try {
        worker_threads.markAsUntransferable(obj);
      } catch {
      }
    }
  };
}
if (typeof Promise.withResolvers === "undefined") {
  Promise.withResolvers = function() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket;
}
