import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * POST /api/student/profile
 * Body: { name, grade, region, subjects }
 * Saves student onboarding data.
 */
export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, grade, region, subjects } = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (name) patch.name = String(name).slice(0, 100);
  if (grade) patch.grade = String(grade).slice(0, 50);
  if (region) patch.school_region = String(region).slice(0, 5);
  if (Array.isArray(subjects)) patch.subjects = subjects.map((s: unknown) => String(s)).slice(0, 20);

  const { error } = await admin.from("users").update(patch).eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
