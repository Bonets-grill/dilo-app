import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const admin = getServiceRoleClient();

export async function GET() {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await admin
    .from("contact_nicknames")
    .select("id, nickname, phone, note, updated_at")
    .eq("user_id", auth.user.id)
    .order("nickname", { ascending: true });

  return NextResponse.json({ nicknames: data || [] });
}

export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { nickname, phone, note } = await req.json().catch(() => ({}));
  const nick = String(nickname || "").trim();
  const ph = String(phone || "").replace(/\D/g, "");
  if (!nick || !ph || ph.length < 8) {
    return NextResponse.json({ error: "nickname and phone (8+ digits) required" }, { status: 400 });
  }

  // Upsert por (user_id, nickname)
  const { data, error } = await admin
    .from("contact_nicknames")
    .upsert(
      {
        user_id: auth.user.id,
        nickname: nick,
        phone: ph,
        note: note ? String(note).slice(0, 200) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,nickname" }
    )
    .select("id, nickname, phone, note")
    .single();

  if (error) return sanitizeError(error, "contacts.nicknames", 500);
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  await admin.from("contact_nicknames").delete().eq("id", id).eq("user_id", auth.user.id);
  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
