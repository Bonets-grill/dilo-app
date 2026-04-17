import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronAuth } from "@/lib/cron/auth";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/cron/study-close-stale
 *
 * Cierra sesiones de estudio con last_heartbeat > 3 min. Corre cada minuto.
 * Sin este cron, si el hijo cierra la app bruscamente (o pierde conexión),
 * la sesión queda abierta para siempre.
 */
export async function GET(req: NextRequest) {
  const gate = requireCronAuth(req); if (gate) return gate;

  const cutoffIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const { data: stale } = await admin
    .from("study_sessions")
    .select("id")
    .is("ended_at", null)
    .lt("last_heartbeat", cutoffIso);

  if (!stale || stale.length === 0) {
    return NextResponse.json({ closed: 0 });
  }

  const now = new Date().toISOString();
  await admin
    .from("study_sessions")
    .update({ ended_at: now })
    .in(
      "id",
      stale.map((r) => r.id)
    );

  return NextResponse.json({ closed: stale.length });
}

export const dynamic = "force-dynamic";
