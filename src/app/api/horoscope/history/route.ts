import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodiacInfoBySign, type ZodiacSign } from "@/lib/zodiac";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/horoscope/history
 * Lista los últimos horóscopos del usuario autenticado (más recientes primero).
 * Devuelve el texto y meta, pero NO el audio — traerlo pesa ~1.3MB por fila y
 * lo único que se muestra en el listado es un preview; el audio se pide al
 * entrar al detalle (/api/horoscope/[date]).
 */
export async function GET(_req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await admin
    .from("horoscopes")
    .select("id, for_date, zodiac_sign, text, meta")
    .eq("user_id", auth.user.id)
    .order("for_date", { ascending: false })
    .limit(60);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).map((row) => {
    const info = zodiacInfoBySign(row.zodiac_sign as ZodiacSign);
    return {
      id: row.id,
      for_date: row.for_date,
      zodiac_sign: row.zodiac_sign,
      zodiac_name: info?.name || row.zodiac_sign,
      zodiac_emoji: info?.emoji || "✨",
      preview: typeof row.text === "string" ? row.text.replace(/[#*_`>]/g, "").slice(0, 180) : "",
      meta: row.meta || {},
    };
  });

  return NextResponse.json({ items });
}

export const dynamic = "force-dynamic";
