import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/require-user";
import { sanitizeOrFilter } from "@/lib/auth/validate";

const supabase = getServiceRoleClient();

/**
 * GET /api/users/search?q=mario — Search DILO users by name or email.
 * userId derived from session. `q` is sanitized to strip PostgREST filter
 * metacharacters before interpolation into .or() (CN-007).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const rawQuery = q.trim().toLowerCase();
  if (rawQuery.length < 2) return NextResponse.json({ users: [] });
  const query = sanitizeOrFilter(rawQuery, 80);
  if (query.length < 2) return NextResponse.json({ users: [] });

  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, avatar_url")
    .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
    .neq("id", userId)
    .limit(10);

  // Check connection status for each user
  const results = [];
  for (const user of users || []) {
    const { data: conn } = await supabase
      .from("user_connections")
      .select("id, status, requester_id")
      .or(`and(requester_id.eq.${userId},receiver_id.eq.${user.id}),and(requester_id.eq.${user.id},receiver_id.eq.${userId})`)
      .limit(1)
      .maybeSingle();

    results.push({
      id: user.id,
      name: user.name || user.email?.split("@")[0],
      email: user.email,
      avatar_url: user.avatar_url,
      connection: conn ? {
        status: conn.status,
        sent_by_me: conn.requester_id === userId,
      } : null,
    });
  }

  return NextResponse.json({ users: results });
}
