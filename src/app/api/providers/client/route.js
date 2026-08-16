import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";
import { backfillCodexEmails } from "@/lib/oauth/providers";
import REGISTRY from "open-sse/providers/registry/index.js";

const SAFE_FIELDS = [
  "id", "provider", "authType", "name", "email", "displayName",
  "priority", "globalPriority", "isActive", "defaultModel",
  "testStatus", "lastError", "lastErrorAt", "errorCode",
  "expiresAt", "lastUsedAt", "consecutiveUseCount",
  "createdAt", "updatedAt",
];

const SAFE_PSD_FIELDS = [
  "baseUrl", "azureEndpoint", "deployment", "apiVersion", "accountId",
  "region", "projectId", "resourceUrl", "proxyPoolId",
  "connectionProxyEnabled", "connectionProxyUrl", "connectionNoProxy",
  "githubLogin", "githubName", "githubEmail", "githubUserId",
  "username", "firstName", "lastName", "authMethod", "authKind",
  "profileArn",
];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 500;

function maskName(name) {
  if (typeof name !== "string" || name.length <= 16) return name;
  if (/[a-zA-Z0-9_-]{32,}/.test(name)) return `${name.slice(0, 8)}***`;
  return name;
}

function sanitize(c) {
  const safe = {};
  for (const f of SAFE_FIELDS) if (c[f] !== undefined) safe[f] = c[f];
  if (safe.name) safe.name = maskName(safe.name);
  if (c.providerSpecificData) {
    const psd = {};
    for (const f of SAFE_PSD_FIELDS) {
      if (c.providerSpecificData[f] !== undefined) psd[f] = c.providerSpecificData[f];
    }
    safe.providerSpecificData = psd;
  }
  return safe;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Group connections by provider: one entry per provider so the Quota Tracker can
// render a single card per provider (with an "N API keys" badge) instead of one
// card per connection. Free/no-auth providers (no saved connection) stay as
// empty groups so they still show a card.
function groupByProvider(connections, freeProviderIds = []) {
  const map = new Map();
  const order = [];
  for (const conn of connections) {
    const p = conn.provider || "";
    if (!map.has(p)) {
      map.set(p, []);
      order.push(p);
    }
    map.get(p).push(conn);
  }
  for (const id of freeProviderIds) {
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
    }
  }
  return order.map((p) => ({ provider: p, connections: map.get(p) }));
}

function sortConnections(connections, sort) {
  const list = [...connections];

  if (sort === "provider") {
    return list.sort((a, b) => a.provider.localeCompare(b.provider));
  }

  return list.sort((a, b) => {
    const priorityA = a.priority ?? Number.MAX_SAFE_INTEGER;
    const priorityB = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return (a.provider || "").localeCompare(b.provider || "");
  });
}

export async function GET(request) {
  try {
    await backfillCodexEmails();

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") || "all";
    const accountStatus = searchParams.get("accountStatus") || "all";
    const sort = searchParams.get("sort") || "priority";
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

    const allConnections = await getProviderConnections();

    // Free/no-auth providers (opencode, local-device, searxng, ...) have no saved
    // connection but are always available — include them as empty groups.
    const freeProviderIds = REGISTRY
      .filter((r) => r.category === "free" && r.noAuth && !r.hidden)
      .map((r) => r.id);

    const providerFilteredGroups = groupByProvider(allConnections, freeProviderIds).filter((g) => (
      provider === "all" || g.provider === provider
    ));

    const accountFilteredGroups = providerFilteredGroups.filter((g) => {
      if (accountStatus === "active") return g.connections.some((c) => c.isActive ?? true) || g.connections.length === 0;
      if (accountStatus === "inactive") return g.connections.length > 0 && g.connections.every((c) => !(c.isActive ?? true));
      return true;
    });

    const sortedGroups = sortConnections(accountFilteredGroups, sort);
    const total = sortedGroups.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;
    const pageGroups = sortedGroups.slice(offset, offset + pageSize);

    const providerOptions = Array.from(new Set(sortedGroups.map((g) => g.provider))).sort();
    const pageConnections = pageGroups.flatMap((g) => g.connections.map(sanitize));

    return NextResponse.json({
      providers: pageGroups.map((g) => ({
        provider: g.provider,
        connections: g.connections.map(sanitize),
      })),
      connections: pageConnections,
      freeProviderIds,
      providerOptions,
      pagination: {
        page: currentPage,
        pageSize,
        total,
        totalPages,
      },
      totals: {
        eligibleConnections: allConnections.length,
        providerFilteredConnections: providerFilteredGroups.length,
        providerCount: total,
        connectionCount: allConnections.length,
      },
    });
  } catch (error) {
    console.log("Error fetching providers for client:", error);
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}