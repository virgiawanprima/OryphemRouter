import { parseJson } from "@/lib/utils/parseJson";
import { NextResponse } from "next/server";
import { getCombos, createCombo, getComboByName, getSettings, updateSettings } from "@/lib/localDb";
import { normalizeComboStrategy, COMBO_STRATEGY_VALUES } from "open-sse/utils/omni/routingStrategies.js";

export const dynamic = "force-dynamic";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// Combo kinds recognized by the UI: LLM combos live on /dashboard/combos,
// webSearch/webFetch combos live on /dashboard/media-providers/web. Any other
// kind is invisible to every dashboard page — reject it instead of creating
// an orphan combo the frontend will never show.
const VALID_KINDS = new Set(["llm", "webSearch", "webFetch"]);

// GET /api/combos - Get all combos
export async function GET() {
  try {
    const combos = await getCombos();
    return NextResponse.json({ combos });
  } catch (error) {
    console.log("Error fetching combos:", error);
    return NextResponse.json({ error: "Failed to fetch combos" }, { status: 500 });
  }
}

// POST /api/combos - Create new combo
export async function POST(request) {
  try {
    const body = await parseJson(request);
    const { name, models, kind } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate name format
    if (!VALID_NAME_REGEX.test(name)) {
      return NextResponse.json({ error: "Name can only contain letters, numbers, -, _ and ." }, { status: 400 });
    }

    // Check if name already exists
    const existing = await getComboByName(name);
    if (existing) {
      return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
    }

    // Validate kind against the kinds the dashboard actually renders.
    const normalizedKind = kind == null || kind === "" ? null : String(kind);
    if (normalizedKind !== null && !VALID_KINDS.has(normalizedKind)) {
      return NextResponse.json(
        { error: `Invalid combo kind '${normalizedKind}'. Valid kinds: llm, webSearch, webFetch` },
        { status: 400 },
      );
    }

    // A combo has no strategy column: the dispatcher reads
    // settings.comboStrategies[<combo name>].fallbackStrategy (src/sse/handlers/chat.js).
    // Accept the strategy here so clients that send it at creation time are honoured
    // instead of silently ignored, and reject unknown values up front (ADR-002).
    const rawStrategy = body.fallbackStrategy ?? body.strategy;
    let normalizedStrategy = null;
    if (rawStrategy !== null && rawStrategy !== undefined && rawStrategy !== "") {
      normalizedStrategy = normalizeComboStrategy(rawStrategy);
      if (!normalizedStrategy) {
        return NextResponse.json(
          { error: `Invalid fallbackStrategy '${rawStrategy}'. Valid values: ${COMBO_STRATEGY_VALUES.join(", ")}` },
          { status: 400 },
        );
      }
    }

    const combo = await createCombo({ name, models: models || [], kind: normalizedKind });

    if (normalizedStrategy) {
      const settings = await getSettings();
      const strategies = { ...(settings.comboStrategies || {}) };
      strategies[name] = { ...(strategies[name] || {}), fallbackStrategy: normalizedStrategy };
      await updateSettings({ comboStrategies: strategies });
    }

    return NextResponse.json(combo, { status: 201 });
  } catch (error) {
    console.log("Error creating combo:", error);
    return NextResponse.json({ error: "Failed to create combo" }, { status: 500 });
  }
}
