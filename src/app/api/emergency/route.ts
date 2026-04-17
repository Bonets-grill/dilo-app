import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require-user";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/emergency?userId=xxx — Get emergency contacts
 * POST /api/emergency — Add/update emergency contact
 * DELETE /api/emergency — Remove emergency contact
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const { data } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  return NextResponse.json({ contacts: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const body = await req.json();
  const userId = auth.user.id;
  const { name, phone, relationship  } = body;
  if (!userId || !name || !phone) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { data, error } = await supabase
    .from("emergency_contacts")
    .insert({ user_id: userId, name, phone, relationship })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req: NextRequest) {
  const { id, userId } = await req.json();
  if (!id || !userId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  await supabase.from("emergency_contacts").delete().eq("id", id).eq("user_id", userId);
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
