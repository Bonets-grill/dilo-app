import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/user/timezone?userId=...
 * Returns { timezone: string | null }
 */
export async function GET(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const { data } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", userId)
    .single();

  const prefs = (data?.preferences as Record<string, unknown>) || {};
  const timezone = (prefs.timezone as string) || null;
  return NextResponse.json({ timezone });
}

/**
 * PUT /api/user/timezone
 * Body: { userId, timezone }  (timezone is an IANA tz like "Atlantic/Canary")
 */
export async function PUT(req: NextRequest) {
  const { userId, timezone } = await req.json();
  if (!userId || !timezone) {
    return NextResponse.json({ error: "Missing userId or timezone" }, { status: 400 });
  }
  if (typeof timezone !== "string" || timezone.length > 100) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  // Validate it's a real IANA timezone
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    return NextResponse.json({ error: "Unknown timezone" }, { status: 400 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", userId)
    .single();

  const prefs = (user?.preferences as Record<string, unknown>) || {};
  prefs.timezone = timezone;

  const { error } = await supabase
    .from("users")
    .update({ preferences: prefs })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, timezone });
}

export const dynamic = "force-dynamic";
