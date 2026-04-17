import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/health
 *
 * Returns 200 if the app is up and Supabase is reachable; 503 otherwise.
 * Intended for external uptime monitors (UptimeRobot, Better Uptime, etc.)
 * and for pre-deploy smoke checks.
 *
 * The Supabase ping uses the public anon key (no secret exposure), hits a
 * cheap `select count(*)` against `users` with a strict limit, and caps its
 * wait at 2.5s so a hung DB can't stall the monitor.
 */
export async function GET() {
  const start = Date.now();
  const env = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  if (!env.supabaseUrl || !env.supabaseAnon) {
    return NextResponse.json(
      { status: "degraded", reason: "missing supabase env", env, uptime_ms: Date.now() - start },
      { status: 503 }
    );
  }

  try {
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const ping = Promise.race([
      supa.from("users").select("id", { count: "exact", head: true }).limit(1),
      new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: "timeout" } }), 2500)
      ),
    ]);
    const res = await ping as { error?: { message: string } | null };
    if (res.error) {
      return NextResponse.json(
        { status: "degraded", reason: `supabase: ${res.error.message}`, uptime_ms: Date.now() - start },
        { status: 503 }
      );
    }
    return NextResponse.json({
      status: "ok",
      uptime_ms: Date.now() - start,
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: "down", reason: err instanceof Error ? err.message : "unknown", uptime_ms: Date.now() - start },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";
