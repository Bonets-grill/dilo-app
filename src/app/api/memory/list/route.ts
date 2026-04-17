import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require-user";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/memory/list?userId=xxx
 * Returns all active (valid_to IS NULL) memory facts for the user, grouped
 * by category. Ordered newest first within each category.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const { data, error } = await supabase
    .from("memory_facts")
    .select("id, fact, category, confidence, source, created_at")
    .eq("user_id", userId)
    .is("valid_to", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grouped: Record<string, typeof data> = {};
  for (const row of data || []) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(row);
  }

  return NextResponse.json({
    total: data?.length || 0,
    by_category: grouped,
    flat: data || [],
  });
}
