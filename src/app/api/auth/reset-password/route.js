import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";

// Reset dashboard password to default by clearing the stored hash.
// Local-only (enforced by dashboardGuard). Never returns the default literal.
export async function POST() {
  try {
    const settings = await getSettings();
    // Bump password version so every previously-issued session JWT dies.
    await updateSettings({ password: null, passwordVersion: (settings.passwordVersion || 0) + 1 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
