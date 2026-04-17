import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const supabase = getServiceRoleClient();

/**
 * GET /api/user/timezone?userId=...
 * Returns { timezone: string | null }
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

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

  if (error) return sanitizeError(error, "user.timezone", 500);
  return NextResponse.json({ ok: true, timezone });
}

export const dynamic = "force-dynamic";
