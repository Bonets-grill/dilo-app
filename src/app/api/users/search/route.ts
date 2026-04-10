import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/users/search?q=mario&userId=xxx
 * Search for DILO users by name or email
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const userId = req.nextUrl.searchParams.get("userId");
  if (!q || !userId) return NextResponse.json({ error: "Missing q or userId" }, { status: 400 });

  const query = q.trim().toLowerCase();
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
