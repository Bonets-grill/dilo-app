import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/consent?userId=xxx — Get user's consent status
 * POST /api/consent — Record consent granted/withdrawn
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // Get latest consent for each type
  const types = ["privacy_policy", "terms", "trading", "whatsapp", "location", "voice", "photos", "journal"];
  const consents: Record<string, { granted: boolean; version: string; date: string }> = {};

  for (const type of types) {
    const { data } = await supabase
      .from("consent_log")
      .select("granted, version, created_at")
      .eq("user_id", userId)
      .eq("consent_type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    consents[type] = data ? { granted: data.granted, version: data.version, date: data.created_at } : { granted: false, version: "", date: "" };
  }

  return NextResponse.json({ consents });
}

export async function POST(req: NextRequest) {
  const { userId, consentType, granted, version } = await req.json();
  if (!userId || !consentType || granted === undefined || !version) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("consent_log") as any).insert({
    user_id: userId,
    consent_type: consentType,
    version,
    granted,
    user_agent: req.headers.get("user-agent") || "",
  });

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
