import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin, adminForbidden } from "@/lib/admin/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/admin/grant
 * Body: { userId, skillId, source? }
 * Grants or re-activates a user_skills row. Admin-only.
 *
 * skillId conventions:
 *   - "course_<slug_with_underscores>"   (e.g. course_claude_de_cero_a_cien)
 *   - any plain skill id ("voice", "tutor", "legal"...)
 *   - pack_* ids work the same way.
 */
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return adminForbidden();

  const { userId, skillId, source } = await req.json();
  if (!userId || !skillId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_skills")
    .upsert(
      {
        user_id: userId,
        skill_id: skillId,
        source: source || "admin_grant",
        status: "active",
      },
      { onConflict: "user_id,skill_id" }
    )
    .select("id, skill_id, status, source")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, skill: data });
}

/**
 * DELETE /api/admin/grant?userId=X&skillId=Y
 * Revokes a user_skills row (marks status='revoked', keeps history).
 */
export async function DELETE(req: NextRequest) {
  if (!requireAdmin(req)) return adminForbidden();

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const skillId = url.searchParams.get("skillId");
  if (!userId || !skillId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_skills")
    .update({ status: "revoked" })
    .eq("user_id", userId)
    .eq("skill_id", skillId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
