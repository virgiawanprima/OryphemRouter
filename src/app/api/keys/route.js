import { parseJson } from "@/lib/utils/parseJson";
import { NextResponse } from "next/server";
import { getApiKeys, collapseDefaultKeyDuplicates, getOrCreateDefaultKey, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { parseApiKey } from "@/shared/utils/apiKey";

export const dynamic = "force-dynamic";

// GET /api/keys - List API keys (self-heals duplicate "Default Key" rows)
export async function GET() {
  try {
    await collapseDefaultKeyDuplicates();
    const keys = await getApiKeys();
    return NextResponse.json({ keys });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  try {
    const body = await parseJson(request);
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    // "Default Key" is the auto-provisioned first key: never more than one.
    const apiKey = name === "Default Key"
      ? await getOrCreateDefaultKey(machineId)
      : await createApiKey(name, machineId);

    // Router keys are OryphemRouter's OWN keys — validate the generated key's
    // format (sk- prefix + expected structure/length) before returning it so we
    // never hand out a malformed credential.
    if (!parseApiKey(apiKey.key) || apiKey.key.length < 32) {
      return NextResponse.json(
        { error: "Failed to generate a valid API key" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
