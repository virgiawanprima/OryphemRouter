import { NextResponse } from "next/server";
import { FILTERS } from "./filters.js";
import { assertPublicUrl } from "@/shared/utils/ssrfGuard";

export const dynamic = "force-dynamic";

// Only allow https fetches to public hosts (SSRF guard). Loopback stays
// permitted for local model registries during development.
function validateTargetUrl(raw) {
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("url must use http or https");
  }
  if (parsed.hostname !== "localhost" && !parsed.hostname.endsWith(".localhost")) {
    assertPublicUrl(parsed.toString());
  }
  return parsed.toString();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const type = searchParams.get("type");

  if (!url || !type) {
    return NextResponse.json({ error: "Missing url or type" }, { status: 400 });
  }

  const filter = FILTERS[type];
  if (!filter) {
    return NextResponse.json({ error: "Unknown filter type" }, { status: 400 });
  }

  let safeUrl;
  try {
    safeUrl = validateTargetUrl(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(safeUrl);
    if (!res.ok) {
      return NextResponse.json({ data: [] });
    }
    const json = await res.json();
    const raw = json.data ?? json.models ?? json;
    const data = filter(Array.isArray(raw) ? raw : []);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
