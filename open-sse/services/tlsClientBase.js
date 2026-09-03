import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { open, unlink, rmdir, readFile, mkdtemp, stat } from "node:fs/promises";
import { resolveProxyForRequest } from "../utils/proxyResolver.js";
import { resolveTlsClientProxyUrl } from "./tlsClientProxy.js";
import { buildNativeTlsClientOptions } from "./tlsClientDownloadDir.js";
class TlsClientUnavailableError extends Error {
  name = "TlsClientUnavailableError";
}
class TlsClientHangError extends Error {
  name = "TlsClientHangError";
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function makeAbortError(signal) {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const err = new Error(typeof reason === "string" ? reason : "The operation was aborted");
  err.name = "AbortError";
  return err;
}
function toHeaders(raw) {
  const h = new Headers();
  for (const [k, vs] of Object.entries(raw || {})) {
    for (const v of vs) h.append(k, v);
  }
  return h;
}
async function raceWithTimeout(promise, timeoutMs, signal) {
  if (!signal) {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new TlsClientHangError()), timeoutMs);
      })
    ]);
  }
  return await new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const timer = setTimeout(() => {
      done(() => reject(new TlsClientHangError()));
    }, timeoutMs);
    const onAbort = () => {
      done(() => reject(makeAbortError(signal)));
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    promise.then(
      (v) => {
        done(() => {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          resolve(v);
        });
      },
      (e) => {
        done(() => {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          reject(e);
        });
      }
    );
  });
}
async function readFirstBytes(path, n) {
  const fd = await open(path, "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fd.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fd.close().catch(() => {
    });
  }
}
async function waitForContent(path, timeoutMs, requestPromise) {
  let requestSettled = false;
  requestPromise.then(
    () => {
      requestSettled = true;
    },
    () => {
      requestSettled = true;
    }
  );
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const s = await stat(path);
      if (s.size > 0) return true;
    } catch {
    }
    if (requestSettled) return false;
    await sleep(25);
  }
  return false;
}
function looksLikeSse(text) {
  const trimmed = text.replace(/^[\s\r\n]+/, "");
  if (!trimmed) return false;
  if (trimmed.startsWith(":")) return true;
  return /^(data|event|id|retry):/i.test(trimmed);
}
function isCloudflareChallenge(text) {
  if (!text) return false;
  return /just a moment|window\._cf_chl_opt|challenges\.cloudflare\.com|attention required|cf-chl/i.test(
    text
  );
}
async function cleanupTempPathSubstring(path) {
  await unlink(path).catch(() => {
  });
  const dir = path.substring(0, path.lastIndexOf("/"));
  await rmdir(dir).catch(() => {
  });
}
async function cleanupTempPathDirname(path) {
  await unlink(path).catch(() => {
  });
  await rmdir(dirname(path)).catch(() => {
  });
}
async function readTextFileIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
function tailFileVariantA(path, eofSymbol, done, signal = null, cleanupPath) {
  return new ReadableStream({
    async start(controller) {
      const fd = await open(path, "r");
      const buf = Buffer.alloc(64 * 1024);
      let offset = 0;
      let finished = false;
      let aborted = false;
      let upstreamError = null;
      done.then(
        () => {
          finished = true;
        },
        (err) => {
          upstreamError = err instanceof Error ? err : new Error(String(err));
          finished = true;
        }
      );
      const onAbort = () => {
        aborted = true;
      };
      if (signal) {
        if (signal.aborted) aborted = true;
        else signal.addEventListener("abort", onAbort, { once: true });
      }
      let errored = false;
      try {
        while (!aborted) {
          const { bytesRead } = await fd.read(buf, 0, buf.length, offset);
          if (bytesRead > 0) {
            const chunk = buf.subarray(0, bytesRead);
            offset += bytesRead;
            const text = chunk.toString("utf8");
            if (text.includes(eofSymbol)) {
              const cutAt = text.indexOf(eofSymbol) + eofSymbol.length;
              controller.enqueue(new Uint8Array(chunk.subarray(0, cutAt)));
              break;
            }
            controller.enqueue(new Uint8Array(chunk));
          } else if (finished) {
            if (upstreamError) {
              controller.error(upstreamError);
              errored = true;
            }
            break;
          } else {
            await sleep(25);
          }
        }
      } catch (err) {
        controller.error(err);
        errored = true;
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
        await fd.close().catch(() => {
        });
        await cleanupTempPathSubstring(cleanupPath);
        if (!errored) controller.close();
      }
    }
  });
}
function tailFileVariantB1(path, eofSymbol, done, signal = null, cleanupPath) {
  return new ReadableStream({
    async start(controller) {
      const fd = await open(path, "r");
      const buf = Buffer.alloc(64 * 1024);
      let offset = 0;
      let finished = false;
      let aborted = false;
      let upstreamError = null;
      done.then(
        () => {
          finished = true;
        },
        (err) => {
          upstreamError = err instanceof Error ? err : new Error(String(err));
          finished = true;
        }
      );
      const onAbort = () => {
        aborted = true;
      };
      if (signal) {
        if (signal.aborted) aborted = true;
        else signal.addEventListener("abort", onAbort, { once: true });
      }
      let errored = false;
      try {
        while (!aborted) {
          const { bytesRead } = await fd.read(buf, 0, buf.length, offset);
          if (bytesRead > 0) {
            const chunk = buf.subarray(0, bytesRead);
            offset += bytesRead;
            const text = chunk.toString("utf8");
            if (text.includes(eofSymbol)) {
              const beforeEof = text.substring(0, text.indexOf(eofSymbol));
              if (beforeEof) {
                controller.enqueue(Buffer.from(beforeEof, "utf8"));
              }
              controller.close();
              return;
            }
            controller.enqueue(Buffer.from(chunk));
          }
          if (finished) {
            while (true) {
              const { bytesRead: bytesRead2 } = await fd.read(buf, 0, buf.length, offset);
              if (bytesRead2 === 0) break;
              const chunk = buf.subarray(0, bytesRead2);
              offset += bytesRead2;
              const text = chunk.toString("utf8");
              if (text.includes(eofSymbol)) {
                const beforeEof = text.substring(0, text.indexOf(eofSymbol));
                if (beforeEof) {
                  controller.enqueue(Buffer.from(beforeEof, "utf8"));
                }
                controller.close();
                return;
              }
              controller.enqueue(Buffer.from(chunk));
            }
            if (upstreamError && !errored) {
              errored = true;
              controller.error(upstreamError);
              return;
            }
            controller.close();
            return;
          }
          await sleep(25);
        }
      } catch (err) {
        if (!errored) {
          errored = true;
          controller.error(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        await fd.close().catch(() => {
        });
        await cleanupTempPathDirname(cleanupPath);
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    }
  });
}
function enqueueChunkMaybeEof(controller, chunk, eofSymbol) {
  const text = chunk.toString("utf8");
  if (!text.includes(eofSymbol)) {
    controller.enqueue(Buffer.from(chunk));
    return false;
  }
  const beforeEof = text.substring(0, text.indexOf(eofSymbol));
  if (beforeEof) controller.enqueue(Buffer.from(beforeEof, "utf8"));
  controller.close();
  return true;
}
async function drainRemaining(fd, buf, offsetRef, controller, eofSymbol) {
  while (true) {
    const { bytesRead } = await fd.read(buf, 0, buf.length, offsetRef.offset);
    if (bytesRead === 0) return "drained";
    const chunk = buf.subarray(0, bytesRead);
    offsetRef.offset += bytesRead;
    if (enqueueChunkMaybeEof(controller, chunk, eofSymbol)) return "closed";
  }
}
function tailFileVariantB2(path, eofSymbol, done, signal = null, cleanupPath) {
  return new ReadableStream({
    async start(controller) {
      const fd = await open(path, "r");
      const buf = Buffer.alloc(64 * 1024);
      const offsetRef = { offset: 0 };
      let finished = false;
      let aborted = false;
      let upstreamError = null;
      let errored = false;
      done.then(
        () => {
          finished = true;
        },
        (err) => {
          upstreamError = err instanceof Error ? err : new Error(String(err));
          finished = true;
        }
      );
      const onAbort = () => {
        aborted = true;
      };
      if (signal) {
        if (signal.aborted) aborted = true;
        else signal.addEventListener("abort", onAbort, { once: true });
      }
      try {
        while (!aborted) {
          const { bytesRead } = await fd.read(buf, 0, buf.length, offsetRef.offset);
          if (bytesRead > 0) {
            const chunk = buf.subarray(0, bytesRead);
            offsetRef.offset += bytesRead;
            if (enqueueChunkMaybeEof(controller, chunk, eofSymbol)) return;
          }
          if (!finished) {
            await sleep(25);
            continue;
          }
          const drained = await drainRemaining(fd, buf, offsetRef, controller, eofSymbol);
          if (drained === "closed") return;
          if (upstreamError && !errored) {
            errored = true;
            controller.error(upstreamError);
            return;
          }
          controller.close();
          return;
        }
      } catch (err) {
        if (!errored) {
          errored = true;
          controller.error(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        await fd.close().catch(() => {
        });
        await cleanupTempPathDirname(cleanupPath);
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    }
  });
}
function createGetClient(config) {
  let clientPromise = null;
  let exitHookInstalled = false;
  const installExitHook = (client) => {
    if (!exitHookInstalled) {
      exitHookInstalled = true;
      process.on("exit", () => {
        void client.stop();
      });
    }
  };
  return async function getClient() {
    if (!clientPromise) {
      clientPromise = (async () => {
        let TLSClientCtor;
        try {
          const mod = await import("tls-client-node");
          TLSClientCtor = mod.TLSClient;
        } catch {
          throw new TlsClientUnavailableError(
            `tls-client-node is not installed \u2014 cannot start TLS client for ${config.providerName}`
          );
        }
        const tlsOptions = {
          ...buildNativeTlsClientOptions()
        };
        if (config.tlsProfile) {
          tlsOptions.clientIdentifier = config.tlsProfile;
        }
        const client = new TLSClientCtor(tlsOptions);
        await client.start();
        installExitHook(client);
        return client;
      })();
    }
    return clientPromise;
  };
}
function resolveProxyUrl(domain, perCall) {
  return resolveTlsClientProxyUrl(domain, perCall, resolveProxyForRequest);
}
const CLEANUP_VARIANTS = {
  A: cleanupTempPathSubstring,
  B: cleanupTempPathDirname
};
const TAIL_FILE_VARIANTS = {
  A: tailFileVariantA,
  B1: tailFileVariantB1,
  B2: tailFileVariantB2
};
function createTlsClientModule(config) {
  const {
    providerName,
    tlsProfile,
    domain,
    tempDirPrefix,
    streamEofSymbol = "[DONE]",
    defaultTimeoutMs = 6e4,
    hardTimeoutGraceMs = 1e4,
    firstByteTimeoutMs = 5e3,
    tailFileVariant,
    responseValidation,
    proxyDomainOverride,
    exportCloudflareCheck
  } = config;
  const getClient = createGetClient({ providerName, tlsProfile });
  function resetClientCache() {
    Object.assign(localState, {
      getClient: createGetClient({ providerName, tlsProfile })
    });
  }
  const localState = { getClient };
  let testOverride = null;
  const tailFileFn = TAIL_FILE_VARIANTS[tailFileVariant];
  const cleanupFn = tailFileVariant === "A" ? cleanupTempPathSubstring : cleanupTempPathDirname;
  async function tlsFetchStreaming(client, url, requestOptions, eofSymbol, signal, hardTimeoutMs, firstByteMs = firstByteTimeoutMs) {
    const dir = await mkdtemp(join(tmpdir(), tempDirPrefix));
    const path = join(dir, `${randomUUID()}.sse`);
    const streamOpts = {
      ...requestOptions,
      streamOutputPath: path,
      streamOutputBlockSize: 1024,
      streamOutputEOFSymbol: eofSymbol
    };
    let resetOnHang = true;
    const requestPromise = raceWithTimeout(
      client.request(url, streamOpts),
      hardTimeoutMs,
      signal
    ).catch((err) => {
      if (resetOnHang && err instanceof TlsClientHangError) {
        resetClientCache();
        resetOnHang = false;
      }
      throw err;
    });
    const ready = await waitForContent(path, firstByteMs, requestPromise);
    if (!ready) {
      const r = await requestPromise.catch(
        (e) => ({ status: 502, headers: {}, body: String(e) })
      );
      const fileText = await readTextFileIfExists(path);
      await cleanupFn(path);
      return {
        status: r.status,
        headers: toHeaders(r.headers),
        text: r.body || fileText,
        body: null
      };
    }
    const peek = await readFirstBytes(path, 256);
    if (responseValidation === "cf") {
      if (isCloudflareChallenge(peek)) {
        await cleanupFn(path);
        return {
          status: 403,
          headers: new Headers({ "Content-Type": "text/html" }),
          text: peek,
          body: null
        };
      }
      if (peek.trimStart().startsWith("<")) {
        await cleanupFn(path);
        return {
          status: 502,
          headers: new Headers({ "Content-Type": "text/html" }),
          text: peek,
          body: null
        };
      }
    } else {
      if (!looksLikeSse(peek)) {
        const r = await requestPromise.catch(
          (e) => ({ status: 502, headers: {}, body: String(e) })
        );
        const fileText = await readTextFileIfExists(path);
        await cleanupFn(path);
        return {
          status: r.status,
          headers: toHeaders(r.headers),
          text: r.body || fileText,
          body: null
        };
      }
    }
    const stream = tailFileFn(path, eofSymbol, requestPromise, signal, path);
    const contentType = responseValidation === "cf" ? "application/x-ndjson" : "text/event-stream";
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });
    return { status: 200, headers, text: null, body: stream };
  }
  async function tlsFetch(url, options = {}) {
    const resolvedProxyUrl = resolveProxyUrl(proxyDomainOverride ?? domain, options.proxyUrl);
    if (testOverride) return testOverride(url, { ...options, proxyUrl: resolvedProxyUrl });
    if (options.signal?.aborted) {
      throw makeAbortError(options.signal);
    }
    const client = await localState.getClient();
    if (options.signal?.aborted) {
      throw makeAbortError(options.signal);
    }
    const requestOptions = {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      tlsClientIdentifier: tlsProfile,
      timeoutMilliseconds: options.timeoutMs ?? defaultTimeoutMs,
      followRedirects: true,
      withRandomTLSExtensionOrder: true,
      proxyUrl: resolvedProxyUrl
    };
    requestOptions.isByteResponse = options.byteResponse === true;
    if (options.stream) {
      return await tlsFetchStreaming(
        client,
        url,
        requestOptions,
        options.streamEofSymbol || streamEofSymbol,
        options.signal ?? null,
        (options.timeoutMs ?? defaultTimeoutMs) + hardTimeoutGraceMs,
        firstByteTimeoutMs
      );
    }
    let tlsResponse;
    try {
      tlsResponse = await raceWithTimeout(
        client.request(url, requestOptions),
        (options.timeoutMs ?? defaultTimeoutMs) + hardTimeoutGraceMs,
        options.signal ?? null
      );
    } catch (err) {
      if (err instanceof TlsClientHangError) {
        resetClientCache();
      }
      throw err;
    }
    if (options.signal?.aborted) {
      throw makeAbortError(options.signal);
    }
    return {
      status: tlsResponse.status,
      headers: toHeaders(tlsResponse.headers),
      text: tlsResponse.body,
      body: null
    };
  }
  const module = {
    tlsFetch,
    __setTlsFetchOverrideForTesting(fn) {
      testOverride = fn;
    }
  };
  if (exportCloudflareCheck) {
    module.isCloudflareChallenge = isCloudflareChallenge;
  }
  if (config.exposeStreamingForTesting) {
    module.__tlsFetchStreamingForTesting = (client, url, requestOptions, eofSymbol = "[DONE]", signal = null, hardTimeoutMs = defaultTimeoutMs + hardTimeoutGraceMs, firstByteMs = firstByteTimeoutMs) => {
      return tlsFetchStreaming(
        client,
        url,
        requestOptions,
        eofSymbol,
        signal,
        hardTimeoutMs,
        firstByteMs
      );
    };
  }
  return module;
}
export {
  TlsClientHangError,
  TlsClientUnavailableError,
  createGetClient,
  createTlsClientModule,
  isCloudflareChallenge,
  looksLikeSse,
  makeAbortError,
  raceWithTimeout,
  readFirstBytes,
  resolveProxyUrl,
  sleep,
  toHeaders,
  waitForContent
};
