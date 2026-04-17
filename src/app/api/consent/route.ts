import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/require-user";

const supabase = getServiceRoleClient();

/**
 * GET /api/consent — Current user's consent status.
 * POST /api/consent — Record consent granted/withdrawn for current user.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

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
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { consentType, granted, version } = body;
  if (!consentType || granted === undefined || !version) {
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
