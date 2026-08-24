import { parseJson } from "@/lib/utils/parseJson";
import { NextResponse } from "next/server";
import { getCustomModels, addCustomModel, deleteCustomModel } from "@/models";
import { getProviderModels } from "open-sse/config/providerModels.js";
import { AI_PROVIDERS } from "@/shared/constants/providers";

export const dynamic = "force-dynamic";

// GET /api/models/custom - List all custom models
export async function GET() {
  try {
    const models = await getCustomModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching custom models:", error);
    return NextResponse.json({ error: "Failed to fetch custom models" }, { status: 500 });
  }
}

// POST /api/models/custom - Add custom model
export async function POST(request) {
  try {
    const { providerAlias, id, type, name } = await parseJson(request);
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }

    // Anti-fraud: for KNOWN (non-passthrough) providers, reject model ids that
    // are not in the advertised catalog. Unknown prefixes (custom compatible
    // nodes) and passthrough providers are left open. Use "Import from /models"
    // to add real ids from the provider's live catalog.
    const knownModels = getProviderModels(providerAlias);
    const isKnownProvider = knownModels.length > 0;
    const isPassthrough = AI_PROVIDERS[providerAlias]?.passthroughModels === true;
    if (isKnownProvider && !isPassthrough && !knownModels.some((m) => m.id === id)) {
      return NextResponse.json({
        error: `Model '${id}' is not in the ${providerAlias} catalog. Use "Import from /models" to add real models from the provider's catalog.`,
        code: "unknown_model",
      }, { status: 400 });
    }

    const added = await addCustomModel({ providerAlias, id, type: type || "llm", name });
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.log("Error adding custom model:", error);
    return NextResponse.json({ error: "Failed to add custom model" }, { status: 500 });
  }
}

// DELETE /api/models/custom?providerAlias=xxx&id=yyy&type=zzz
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "llm";
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    await deleteCustomModel({ providerAlias, id, type });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting custom model:", error);
    return NextResponse.json({ error: "Failed to delete custom model" }, { status: 500 });
  }
}
