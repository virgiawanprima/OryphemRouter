/**
 * Graceful shutdown helper for the oryphemrouter CLI.
 *
 * Replaces abrupt `process.exit()` calls with a drain-friendly shutdown:
 *   1. Closes the HTTP server handle the CLI started (wired by cli.js via
 *      `globalThis.__serverHandle`) so in-flight connections can drain.
 *   2. Stops the tray icon so its Go/PowerShell process can release resources.
 *   3. Waits a short grace period (`CLI_EXIT_GRACE_MS`, default 300ms) so
 *      in-flight output/flushes drain, then exits with the requested code.
 *
 * Shared by cli/cli.js and cli/src/** (tray, menus, input, commands) so every
 * exit path uses a single idempotent shutdown routine. The first call wins;
 * subsequent calls during the grace period are ignored.
 */

let shuttingDown = false;

function gracefulExit(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  // Close the HTTP server handle the CLI started (set by cli.js via
  // `globalThis.__serverHandle`). Supports both a real http.Server (.close)
  // and a spawned ChildProcess handle (.kill) used by the launcher.
  try {
    const handle = globalThis.__serverHandle;
    if (handle) {
      if (typeof handle.close === "function") {
        handle.close();
      } else if (typeof handle.kill === "function") {
        handle.kill("SIGTERM");
      }
    }
  } catch {}
  // Stop the tray so it releases its NSStatusItem / NotifyIcon before exit.
  try {
    if (typeof killTray === "function") {
      killTray().catch(() => {});
    } else {
      require("../tray/tray").killTray().catch(() => {});
    }
  } catch {}
  // Small grace period so in-flight output/flushes drain, then exit.
  const graceMs = process.env.CLI_EXIT_GRACE_MS ? Number(process.env.CLI_EXIT_GRACE_MS) : 300;
  setTimeout(() => process.exit(code), graceMs);
}

module.exports = { gracefulExit };
