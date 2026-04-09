import { NextRequest, NextResponse } from "next/server";
import { saveAlpacaKeys, getAlpacaKeys } from "@/lib/oauth/alpaca";
import { getAccount } from "@/lib/alpaca/client";

/**
 * POST: Save Alpaca API keys for a user (validates them first)
 * GET: Check if user has keys configured
 */
export async function POST(req: NextRequest) {
  const { userId, keyId, secretKey } = await req.json();

  if (!userId || !keyId || !secretKey) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Validate keys by trying to fetch account
  try {
    const auth = { keyId, secretKey, paperMode: keyId.startsWith("PK") };
    await getAccount(auth);
  } catch {
    return NextResponse.json({ error: "API keys inválidas. Verifica que las copiaste correctamente." }, { status: 400 });
  }

  const ok = await saveAlpacaKeys(userId, keyId, secretKey, keyId.startsWith("PK"));
  if (!ok) {
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paperMode: keyId.startsWith("PK") });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ connected: false });

  const keys = await getAlpacaKeys(userId);
  return NextResponse.json({ connected: !!keys, paperMode: keys?.paperMode });
}
