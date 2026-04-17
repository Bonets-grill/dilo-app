import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * Central auth gate for API routes that act on behalf of the current user.
 *
 * Before (IDOR pattern — do not repeat):
 *   const userId = new URL(req.url).searchParams.get("userId"); // client-controlled
 *   const { data } = await admin.from("x").select().eq("user_id", userId);
 *
 * After:
 *   const auth = await requireUser();
 *   if (auth.error) return auth.error;
 *   const { user, supa } = auth;  // userId = user.id (trusted session)
 *
 * Returns the Supabase anon client already scoped to the user's session
 * cookie, so RLS applies by default. Use the service-role `admin` client
 * ONLY for operations the user is not authorized to do directly (e.g.
 * cron, webhook fulfillment, admin grant).
 */
export async function requireUser(): Promise<
  | { user: User; supa: SupabaseClient; error?: never }
  | { error: NextResponse; user?: never; supa?: never }
> {
  const supa = await createServerSupabase();
  const { data } = await supa.auth.getUser();
  if (!data.user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { user: data.user, supa };
}
