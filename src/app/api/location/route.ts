import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/require-user";

const supabase = getServiceRoleClient();

/**
 * POST /api/location — Save user location (for Adventure Mode + emergency).
 * GET  /api/location?limit=20 — Recent locations for the caller only.
 *
 * userId always derives from the authenticated session (requireUser).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { lat, lng, accuracy, speed, altitude } = body;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Missing or invalid lat/lng" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("location_history") as any).insert({
    user_id: userId, lat, lng, accuracy, speed, altitude,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  const { data } = await supabase
    .from("location_history")
    .select("lat, lng, accuracy, speed, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return NextResponse.json({ locations: data || [] });
}

export const dynamic = "force-dynamic";
