import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * Central auth gate for API routes that act on behalf of the current user.
 *
 * Accepts two auth sources (cookie first, Bearer fallback):
 *   1. Supabase session cookie (browser / PWA same-origin).
 *   2. `Authorization: Bearer <access_token>` header (Capacitor native
 *      WebView where cookies from `capacitor://localhost` don't reach
 *      `https://ordydilo.com/api/*`).
 *
 * Before (IDOR pattern — do not repeat):
 *   const userId = new URL(req.url).searchParams.get("userId"); // client-controlled
 *   const { data } = await admin.from("x").select().eq("user_id", userId);
 *
 * After:
 *   const auth = await requireUser();
 *   if (auth.error) return auth.error;
 *   const { user, supa } = auth;  // userId = user.id (trusted session)
 */
export async function requireUser(): Promise<
  | { user: User; supa: SupabaseClient; error?: never }
  | { error: NextResponse; user?: never; supa?: never }
> {
  // 1. Try cookie-based session (same-origin web / PWA).
  const supa = await createServerSupabase();
  const { data } = await supa.auth.getUser();
  if (data.user) {
    return { user: data.user, supa };
  }

  // 2. Fallback: Bearer token from Authorization header (Capacitor bundle).
  const h = await headers();
  const authz = h.get("authorization") || h.get("Authorization");
  if (authz?.startsWith("Bearer ")) {
    const token = authz.slice(7).trim();
    if (token) {
      // Inject the JWT into PostgREST requests so RLS evaluates as the
      // token's user — matches the behavior of the cookie path.
      const authed = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        }
      );
      const { data: userRes } = await authed.auth.getUser(token);
      if (userRes.user) {
        return { user: userRes.user, supa: authed };
      }
    }
  }

  return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
}
