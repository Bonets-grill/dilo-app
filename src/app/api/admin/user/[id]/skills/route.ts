import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminForbidden } from "@/lib/admin/auth";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

/**
 * GET /api/admin/user/[id]/skills
 * Returns active user_skills rows for this user, plus a flattened view of
 * owned courses.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin(req))) return adminForbidden();
  const { id: userId } = await params;

  const { data: skills } = await supabase
    .from("user_skills")
    .select("id, skill_id, source, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return NextResponse.json({ skills: skills || [] });
}

export const dynamic = "force-dynamic";
