import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const admin = getServiceRoleClient();

/**
 * POST /api/family/invite
 * Body: { kid_nickname?: string }
 *
 * El padre genera un código de 6 caracteres para invitar a un hijo. El
 * código expira en 7 días y solo sirve una vez.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { kid_nickname } = await req.json().catch(() => ({}));

  // Marca al user como parent si todavía no lo es
  await admin.from("users").update({ family_role: "parent" }).eq("id", auth.user.id).in("family_role", ["adult"]);

  // CN-025: crypto.randomInt instead of Math.random for invite codes.
  // 6-char alphanumeric sin ambigüedades (sin 0,O,I,1).
  const { randomInt } = await import("node:crypto");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[randomInt(0, alphabet.length)];

  const { data, error } = await admin
    .from("family_invites")
    .insert({
      code,
      parent_user_id: auth.user.id,
      kid_nickname: kid_nickname || null,
    })
    .select("code, expires_at, kid_nickname")
    .single();

  if (error) return sanitizeError(error, "family.invite", 500);
  return NextResponse.json(data);
}

/**
 * GET /api/family/invite
 * Lista los invites pendientes del padre (no usados y no expirados).
 */
export async function GET(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await admin
    .from("family_invites")
    .select("code, kid_nickname, expires_at, used_by_user_id, used_at, created_at")
    .eq("parent_user_id", auth.user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ invites: data || [] });
}

export const dynamic = "force-dynamic";
