import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { sanitizeError } from "@/lib/errors";

const supabase = getServiceRoleClient();

/**
 * POST /api/cursos/[slug]/unlock
 * Body: { userId }
 * Header: x-admin-key: <ADMIN_SECRET>
 *
 * Grants a user access to a course (inserts into user_skills). Protected by
 * ADMIN_SECRET env so only the operator or the Stripe webhook can call it.
 * Intended to be called:
 *   1) Manually by the owner (curl with admin key) for comp tickets
 *   2) By the Stripe webhook after a checkout.session.completed event
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const adminKey = req.headers.get("x-admin-key");
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }
  if (adminKey !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "missing_userId" }, { status: 400 });

  // Verify course exists
  const { data: course } = await supabase
    .from("courses")
    .select("id, slug")
    .eq("slug", slug)
    .eq("published", true)
    .single();
  if (!course) return NextResponse.json({ error: "course_not_found" }, { status: 404 });

  const skillId = `course_${slug.replace(/-/g, "_")}`;

  // Insert or upsert the user_skills row
  const { data, error } = await supabase
    .from("user_skills")
    .upsert(
      {
        user_id: userId,
        skill_id: skillId,
        source: "admin_grant",
        status: "active",
      },
      { onConflict: "user_id,skill_id" }
    )
    .select("id, skill_id, status")
    .single();

  if (error) return sanitizeError(error, "cursos.[slug].unlock", 500);
  return NextResponse.json({ ok: true, granted: data });
}

export const dynamic = "force-dynamic";
