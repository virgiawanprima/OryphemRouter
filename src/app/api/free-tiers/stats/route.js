import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getUsageStats("30d");

    // Free-tier budget definitions (from known free providers)
    const freeTiers = [
      {
        provider: "Kiro AI",
        alias: "kr",
        type: "credits",
        total: 50,
        unit: "credits/mo",
        used: stats?.byProvider?.["kiro"]?.cost || stats?.byProvider?.["kr"]?.cost || 0,
        reset: "Monthly (1st)",
        description: "Claude 4.5 + GLM-5 + MiniMax free",
        link: "/dashboard/providers",
        icon: "kiro",
      },
      {
        provider: "OpenCode Free",
        alias: "oc",
        type: "unlimited",
        total: "∞",
        unit: "tokens",
        used: 0,
        reset: "None",
        description: "No auth, auto-fetch models",
        link: "/dashboard/providers",
        icon: "opencode",
      },
      {
        provider: "Vertex AI",
        alias: "vertex",
        type: "credits",
        total: 300,
        unit: "$ credits",
        used: stats?.byProvider?.["vertex"]?.cost || 0,
        reset: "One-time (90 days)",
        description: "Gemini 3 Pro + GLM-5 + DeepSeek via GCP",
        link: "/dashboard/providers",
        icon: "gemini",
      },
      {
        provider: "Felo",
        alias: "felo",
        type: "unlimited",
        total: "∞",
        unit: "free",
        used: 0,
        reset: "None",
        description: "Free search + chat via Felo.ai",
        link: "/dashboard/providers",
        icon: "search",
      },
    ];

    // Total free tokens per month estimation
    const totalStats = {
      totalFreeCredits: freeTiers.filter(t => t.type === "credits").reduce((a, b) => a + (b.total || 0), 0),
      totalUsedCredits: freeTiers.filter(t => t.type === "credits").reduce((a, b) => a + (b.used || 0), 0),
      freeTiers,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(totalStats);
  } catch (error) {
    console.error("[API] Failed to fetch free-tier stats:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}