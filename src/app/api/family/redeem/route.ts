import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const admin = getServiceRoleClient();

/**
 * POST /api/family/redeem
 * Body: { code: string }
 *
 * El hijo introduce el código de invitación. Lo vincula como kid bajo el
 * parent_user_id del padre. Idempotente: si el hijo ya está vinculado a
 * ese padre, devuelve success. Si está vinculado a otro padre, falla.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const { data: invite } = await admin
    .from("family_invites")
    .select("code, parent_user_id, expires_at, used_by_user_id")
    .eq("code", normalized)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "invalid_code" }, { status: 404 });
  if (invite.used_by_user_id) {
    return NextResponse.json({ error: "code_already_used" }, { status: 409 });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "code_expired" }, { status: 410 });
  }
  if (invite.parent_user_id === auth.user.id) {
    return NextResponse.json({ error: "cannot_invite_self" }, { status: 400 });
  }

  // Check: el hijo no debe estar ya vinculado a otro padre
  const { data: kid } = await admin
    .from("users")
    .select("parent_user_id, family_role")
    .eq("id", auth.user.id)
    .single();

  if (kid?.parent_user_id && kid.parent_user_id !== invite.parent_user_id) {
    return NextResponse.json({ error: "already_linked_to_another_parent" }, { status: 409 });
  }

  // Vincular
  const { error: upErr } = await admin
    .from("users")
    .update({ family_role: "kid", parent_user_id: invite.parent_user_id })
    .eq("id", auth.user.id);

  if (upErr) return sanitizeError(upErr, "family.redeem", 500);

  // Marcar invite como usado
  await admin
    .from("family_invites")
    .update({ used_by_user_id: auth.user.id, used_at: new Date().toISOString() })
    .eq("code", normalized);

  return NextResponse.json({ success: true, parent_user_id: invite.parent_user_id });
}

export const dynamic = "force-dynamic";
