import { NextResponse } from "next/server";
import { getCacheStats } from "@/sse/services/semanticCache";

export const dynamic = "force-dynamic";

// GET /api/cache/stats — semantic cache hit/miss/savings telemetry.
// Dashboard-only (protected by the global dashboard auth guard).
export async function GET() {
  try {
    const stats = getCacheStats();
    return NextResponse.json({ ok: true, cache: stats });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to load cache stats" }, { status: 500 });
  }
}
