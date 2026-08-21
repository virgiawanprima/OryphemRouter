import dns from "dns";

// Force public DNS to bypass OS negative cache (mDNSResponder holds NXDOMAIN)
const resolver = new dns.promises.Resolver();
resolver.setServers(["1.1.1.1", "1.0.0.1", "8.8.8.8"]);

// Try custom public DNS first. Do NOT fall back to the OS resolver for
// trust decisions — /etc/hosts poisoning enables DNS rebinding attacks.
// Only fall back for non-trust purposes (e.g. *.ts.net which Cloudflare
// DNS may not resolve). The caller (probeUrlAlive) re-validates the IP.
export async function resolveDns(hostname, timeoutMs) {
  const tryResolver = (fn) => Promise.race([
    fn(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("dns timeout")), timeoutMs)),
  ]).then(() => true).catch(() => false);

  // Primary: public DNS (bypasses /etc/hosts and OS negative cache)
  if (await tryResolver(() => resolver.resolve4(hostname))) return true;

  // Fallback: OS resolver — needed for *.ts.net and local hostnames,
  // but the caller MUST validate the resolved IP is not private/internal.
  return tryResolver(() => dns.promises.resolve4(hostname));
}
