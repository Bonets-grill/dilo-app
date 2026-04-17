import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodiacInfoBySign, type ZodiacSign } from "@/lib/zodiac";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/horoscope/[date]
 * Devuelve el horóscopo del usuario para una fecha YYYY-MM-DD (incluye audio).
 * 404 si no existe — no lo genera en fechas pasadas, sólo lee.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ date: string }> }
) {
  const { date } = await ctx.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad_date" }, { status: 400 });
  }

  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await admin
    .from("horoscopes")
    .select("id, for_date, zodiac_sign, text, audio_url, meta")
    .eq("user_id", auth.user.id)
    .eq("for_date", date)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const info = zodiacInfoBySign(data.zodiac_sign as ZodiacSign);
  return NextResponse.json({ horoscope: data, zodiac: info });
}

export const dynamic = "force-dynamic";
