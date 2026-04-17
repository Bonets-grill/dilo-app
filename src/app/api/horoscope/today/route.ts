import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateHoroscope } from "@/lib/horoscope/generate";
import { fetchExternalContext } from "@/lib/horoscope/context";
import { zodiacInfoBySign, type ZodiacSign } from "@/lib/zodiac";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/horoscope/today
 * Devuelve el horóscopo del día. Si el cron aún no lo ha generado,
 * lo genera on-demand para que el usuario pueda verlo cuando abra la app.
 */
export async function GET(_req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await admin
    .from("horoscopes")
    .select("id, text, audio_url, meta, zodiac_sign, for_date")
    .eq("user_id", auth.user.id)
    .eq("for_date", today)
    .maybeSingle();

  if (existing) {
    const info = zodiacInfoBySign(existing.zodiac_sign as ZodiacSign);
    return NextResponse.json({
      horoscope: existing,
      zodiac: info,
    });
  }

  // On-demand generation (si el cron aún no corrió)
  const { data: user } = await admin
    .from("users")
    .select("name, email, zodiac_sign, birthdate")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!user?.zodiac_sign || !user?.birthdate) {
    return NextResponse.json({ error: "missing_birthdate" }, { status: 400 });
  }

  const [{ data: facts }, extra] = await Promise.all([
    admin
      .from("memory_facts")
      .select("fact, category")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    fetchExternalContext(admin, auth.user.id),
  ]);

  const mergedFacts: Array<{ fact: string; category: string }> = [
    ...extra,
    ...((facts as Array<{ fact: string; category: string }>) || []),
  ];

  const h = await generateHoroscope({
    userId: auth.user.id,
    userName: user.name || user.email?.split("@")[0] || null,
    zodiac: user.zodiac_sign as ZodiacSign,
    facts: mergedFacts,
    forDate: today,
  });

  if (!h.text) return NextResponse.json({ error: "generation_failed" }, { status: 500 });

  const { data: inserted } = await admin
    .from("horoscopes")
    .insert({
      user_id: auth.user.id,
      for_date: today,
      zodiac_sign: user.zodiac_sign,
      text: h.text,
      audio_url: h.audioBase64,
      meta: h.meta,
    })
    .select("id, text, audio_url, meta, zodiac_sign, for_date")
    .single();

  const info = zodiacInfoBySign(user.zodiac_sign as ZodiacSign);
  return NextResponse.json({ horoscope: inserted, zodiac: info });
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
