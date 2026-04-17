import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin, adminForbidden } from "@/lib/admin/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/admin/users?q=...&limit=50
 * Returns users matching email/name search. Admin-only.
 * Includes basic counts (skills, conversations) for quick overview.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return adminForbidden();

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

  let query = supabase
    .from("users")
    .select("id, email, name, created_at, preferences")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  }

  const { data: users, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with skill count + google connected
  const enriched = await Promise.all(
    (users || []).map(async (u) => {
      const { count: skillCount } = await supabase
        .from("user_skills")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.id)
        .eq("status", "active");
      const prefs = (u.preferences as Record<string, unknown>) || {};
      const gOauth = prefs.google_oauth as Record<string, unknown> | undefined;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        created_at: u.created_at,
        skill_count: skillCount || 0,
        google_connected: !!gOauth?.access_token,
        timezone: (prefs.timezone as string) || null,
      };
    })
  );

  return NextResponse.json({ users: enriched, total: enriched.length });
}

export const dynamic = "force-dynamic";
