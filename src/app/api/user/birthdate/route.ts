import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodiacFromDate } from "@/lib/zodiac";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const admin = getServiceRoleClient();

/**
 * POST /api/user/birthdate
 * Body: { birthdate: "YYYY-MM-DD", birthTime?: "HH:mm", birthPlace?: string }
 * Obligatorio; calcula zodiac_sign automáticamente.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { birthdate, birthTime, birthPlace } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate || "")) {
    return NextResponse.json({ error: "birthdate_invalid" }, { status: 400 });
  }
  const parsed = new Date(birthdate + "T00:00:00Z");
  const now = new Date();
  const age = (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (isNaN(parsed.getTime()) || age < 5 || age > 120) {
    return NextResponse.json({ error: "birthdate_unreasonable" }, { status: 400 });
  }
  const zodiac = zodiacFromDate(birthdate);
  if (!zodiac) return NextResponse.json({ error: "zodiac_compute_failed" }, { status: 400 });

  const patch: Record<string, string | null> = {
    birthdate,
    zodiac_sign: zodiac.key,
  };
  if (birthTime && /^\d{2}:\d{2}$/.test(birthTime)) patch.birth_time = birthTime + ":00";
  if (typeof birthPlace === "string" && birthPlace.trim().length > 0) {
    patch.birth_place = birthPlace.trim().slice(0, 120);
  }

  const { error } = await admin.from("users").update(patch).eq("id", auth.user.id);
  if (error) return sanitizeError(error, "user.birthdate", 500);

  return NextResponse.json({ ok: true, zodiac: zodiac.key, zodiacName: zodiac.name });
}

export const dynamic = "force-dynamic";
