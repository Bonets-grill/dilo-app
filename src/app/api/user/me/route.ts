import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/user/me
 *
 * Devuelve perfil del usuario autenticado. Solo campos no sensibles necesarios
 * para UI (family_role, parent_user_id, name, email, timezone).
 */
export async function GET() {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await admin
    .from("users")
    .select("id, name, email, family_role, parent_user_id, timezone, locale")
    .eq("id", auth.user.id)
    .single();

  return NextResponse.json(data || { id: auth.user.id });
}

export const dynamic = "force-dynamic";
