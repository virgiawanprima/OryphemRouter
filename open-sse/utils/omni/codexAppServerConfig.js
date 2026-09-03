import { readFileSync } from "node:fs";
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}
function firstStringWithSource(psdValue, envValue) {
  if (typeof psdValue === "string" && psdValue.trim().length > 0) {
    return { value: psdValue.trim(), source: "psd" };
  }
  if (typeof envValue === "string" && envValue.trim().length > 0) {
    return { value: envValue.trim(), source: "env" };
  }
  return null;
}
function resolveTokenWithSource(psd) {
  const inlinePsd = firstString(psd?.codexAppServerToken);
  if (inlinePsd) return { value: inlinePsd, source: "psd" };
  const inlineEnv = firstString(process.env.OMNIROUTE_CODEX_APPSERVER_WS_TOKEN);
  if (inlineEnv) return { value: inlineEnv, source: "env" };
  const filePsd = firstString(psd?.codexAppServerTokenFile);
  if (filePsd) {
    const contents = readTokenFile(filePsd);
    if (contents) return { value: contents, source: "psd" };
  }
  const fileEnv = firstString(process.env.OMNIROUTE_CODEX_APPSERVER_WS_TOKEN_FILE);
  if (fileEnv) {
    const contents = readTokenFile(fileEnv);
    if (contents) return { value: contents, source: "env" };
  }
  return null;
}
function readTokenFile(tokenFile) {
  try {
    const contents = readFileSync(tokenFile, "utf8").trim();
    return contents.length > 0 ? contents : null;
  } catch {
    return null;
  }
}
function isWebSocketUrl(url) {
  return url.startsWith("ws://") || url.startsWith("wss://");
}
function urlHostname(url) {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
function isLocalAppServerHost(hostname) {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".ts.net") || h.endsWith(".internal")) return true;
  if (h.includes(":")) {
    if (h === "::1") return true;
    return /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (!h.includes(".")) return true;
  return false;
}
function resolveAppServerConfig(psd) {
  const urlRes = firstStringWithSource(psd?.codexAppServerUrl, process.env.OMNIROUTE_CODEX_APPSERVER_WS);
  if (!urlRes || !isWebSocketUrl(urlRes.value)) return null;
  const tokenRes = resolveTokenWithSource(psd);
  if (!tokenRes) return null;
  if (tokenRes.source === "env" && urlRes.source === "psd") {
    const host = urlHostname(urlRes.value);
    if (!host || !isLocalAppServerHost(host)) return null;
  }
  const url = urlRes.value;
  const token = tokenRes.value;
  const cwd = firstString(psd?.codexAppServerCwd, process.env.OMNIROUTE_CODEX_APPSERVER_CWD) ?? "/tmp";
  const approvalPolicy = firstString(psd?.codexAppServerApprovalPolicy, process.env.OMNIROUTE_CODEX_APPSERVER_APPROVAL) ?? void 0;
  const sandbox = firstString(psd?.codexAppServerSandbox, process.env.OMNIROUTE_CODEX_APPSERVER_SANDBOX) ?? void 0;
  return { url, token, cwd, ...approvalPolicy ? { approvalPolicy } : {}, ...sandbox ? { sandbox } : {} };
}
function resolveThreadStartPolicy(config, psd) {
  const raw = firstString(
    psd?.codexAppServerAutoApprove,
    process.env.OMNIROUTE_CODEX_APPSERVER_AUTO_APPROVE
  );
  const autoApprove = raw === "true" || raw === "1" || raw === "yes";
  return {
    approvalPolicy: config.approvalPolicy ?? "never",
    sandbox: config.sandbox ?? "workspace-write",
    autoApprove
  };
}
export {
  isLocalAppServerHost,
  resolveAppServerConfig,
  resolveThreadStartPolicy
};
