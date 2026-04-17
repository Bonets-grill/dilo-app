import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const admin = getServiceRoleClient();

/**
 * GET  /api/cursos/[slug]/progress → { state, updated_at } (o 404 si no hay)
 * PUT  /api/cursos/[slug]/progress { state } → upsert y devuelve updated_at
 *
 * Auth server-side vía cookie Supabase. Solo el dueño ve/edita su fila.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await admin
    .from("course_progress")
    .select("state, updated_at")
    .eq("user_id", auth.user.id)
    .eq("course_slug", slug)
    .maybeSingle();

  if (error) return sanitizeError(error, "cursos.[slug].progress", 500);
  if (!data) return NextResponse.json({ state: null, updated_at: null });
  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { state?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (!body.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "missing_state" }, { status: 400 });
  }

  // Hard cap on payload size — prevent a runaway client from filling the row.
  const sizeKB = Buffer.byteLength(JSON.stringify(body.state)) / 1024;
  if (sizeKB > 512) {
    return NextResponse.json({ error: "state_too_large", kb: sizeKB }, { status: 413 });
  }

  const { data, error } = await admin
    .from("course_progress")
    .upsert(
      { user_id: auth.user.id, course_slug: slug, state: body.state },
      { onConflict: "user_id,course_slug" }
    )
    .select("updated_at")
    .single();

  if (error) return sanitizeError(error, "cursos.[slug].progress", 500);
  return NextResponse.json({ ok: true, updated_at: data.updated_at });
}

export const dynamic = "force-dynamic";
