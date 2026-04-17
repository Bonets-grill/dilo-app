import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const admin = getServiceRoleClient();

/**
 * DELETE /api/conversations/[id]
 * Soft-hides the conversation from the user's panel without deleting messages.
 * The agent keeps reading public.messages for facts/context (memoria intacta).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await admin
    .from("conversations")
    .update({ hidden_from_user: true, hidden_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id, hidden_from_user")
    .maybeSingle();

  if (error) return sanitizeError(error, "conversations.[id]", 500);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: data.id });
}

export const dynamic = "force-dynamic";
