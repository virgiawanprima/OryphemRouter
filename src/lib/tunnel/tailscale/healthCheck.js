import { resolveDns } from "../shared/dnsResolver.js";
import { HEALTH_CHECK } from "./config.js";

export async function probeUrlAlive(url) {
  if (!url) return false;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }

  // Enforce https or http scheme only
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  // Block private/internal/metadata hosts (SSRF guard for corrupted state)
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    // loopback is OK for local tunnel testing
  } else if (
    host.startsWith("10.") || host.startsWith("172.16.") || host.startsWith("172.17.") ||
    host.startsWith("172.18.") || host.startsWith("172.19.") || host.startsWith("172.2") ||
    host.startsWith("192.168.") || host.startsWith("169.254.") || host === "0.0.0.0"
  ) {
    return false;
  }

  if (!await resolveDns(parsed.hostname, HEALTH_CHECK.dnsTimeoutMs)) return false;

  try {
    const res = await fetch(`${parsed.origin}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_CHECK.fetchTimeoutMs),
      redirect: "manual", // Don't follow redirects — captive portals return 200 on everything
    });
    // Require exact 200 and check body contains "ok" to avoid false positives
    if (res.status !== 200) return false;
    const body = await res.text().catch(() => "");
    return body.includes("ok") || body.includes("healthy") || body.includes('"status"');
  } catch {
    return false;
  }
}

export async function waitForHealth(url, cancelToken = { cancelled: false }) {
  const start = Date.now();
  while (Date.now() - start < HEALTH_CHECK.timeoutMs) {
    if (cancelToken.cancelled) throw new Error("cancelled");
    if (await probeUrlAlive(url)) return true;
    await new Promise((r) => setTimeout(r, HEALTH_CHECK.intervalMs));
  }
  throw new Error(`Health check timeout after ${HEALTH_CHECK.timeoutMs}ms`);
}
