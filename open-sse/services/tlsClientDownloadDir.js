import { join } from "node:path";
import { tmpdir } from "node:os";

function resolveTlsClientDownloadDir() {
  return join(tmpdir(), "oryphemrouter", "tls-client", "bin");
}
function buildNativeTlsClientOptions() {
  return {
    runtimeMode: "native",
    downloadDir: resolveTlsClientDownloadDir()
  };
}
export {
  buildNativeTlsClientOptions,
  resolveTlsClientDownloadDir
};
