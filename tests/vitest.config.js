import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.js"],
    // Don't scan into git worktrees nested under .claude/ — they carry their
    // own copies of the test files but lack an installed node_modules (open-sse,
    // etc.), which makes provider imports fail during collection.
    // Don't scan git worktrees nested under .claude/ or the separate
    // Cloudflare Workers deployable (cloud/) that isn't in this working tree.
    exclude: ["**/node_modules/**", "**/.claude/**", "**/dist/**", "**/embeddings.cloud.test.js"],
    // Allow many it.concurrent cases (real provider smoke runs ~50 providers in parallel)
    maxConcurrency: 60,
    // 5s is too tight for specs whose setup re-initialises the module graph per test
    // (vi.resetModules + a fresh DATA_DIR, which re-loads sql.js wasm). Those tests pass in
    // isolation but intermittently time out when the whole suite runs in parallel — observed
    // as "Test timed out in 5000ms" in compatible-provider-connections.test.js. A modest bump
    // keeps real hangs visible while removing the load-dependent flake.
    testTimeout: 15_000,
    // Suppress noisy console output from handlers under test
    silent: false,
  },
  resolve: {
    // Use array form so subpath aliases (e.g. "@/lib/db/index.js") resolve correctly.
    alias: [
      { find: /^open-sse\//, replacement: resolve(__dirname, "../open-sse") + "/" },
      { find: "open-sse", replacement: resolve(__dirname, "../open-sse") },
      { find: /^@\//, replacement: resolve(__dirname, "../src") + "/" },
    ],
  },
});
