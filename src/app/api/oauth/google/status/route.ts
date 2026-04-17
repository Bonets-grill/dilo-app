import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require-user";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/oauth/google/status?userId=...
 * Returns { connected: boolean, expires_at?: number, email?: string }.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const { data: user } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", userId)
    .single();

  const prefs = (user?.preferences as Record<string, unknown>) || {};
  const oauth = prefs.google_oauth as Record<string, unknown> | undefined;
  const connected = !!oauth?.access_token;

  return NextResponse.json({
    connected,
    expires_at: oauth?.expires_at || null,
    email: oauth?.email || null,
  });
}

/**
 * DELETE /api/oauth/google/status?userId=...
 * Disconnects Google for the user (removes stored tokens).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const { data: user } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", userId)
    .single();

  const prefs = (user?.preferences as Record<string, unknown>) || {};
  delete prefs.google_oauth;

  await supabase.from("users").update({ preferences: prefs }).eq("id", userId);

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
