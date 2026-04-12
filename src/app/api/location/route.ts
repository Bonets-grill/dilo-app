import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/location — Save user location (for Adventure Mode + emergency)
 * GET /api/location?userId=xxx&limit=20 — Get recent locations
 */
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { userId, lat, lng, accuracy, speed, altitude } = body;
  if (!userId || !lat || !lng) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("location_history") as any).insert({
    user_id: userId, lat, lng, accuracy, speed, altitude,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const { data } = await supabase
    .from("location_history")
    .select("lat, lng, accuracy, speed, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return NextResponse.json({ locations: data || [] });
}

export const dynamic = "force-dynamic";
