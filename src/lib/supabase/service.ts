import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Central service-role Supabase client. Imports `server-only` at the top:
 * any file importing this (directly or transitively) that ends up in a
 * client bundle will fail the build with a clear error — preventing
 * accidental leakage of the service role key to the browser.
 *
 * Use this ONLY for operations the current user is not authorized to do
 * directly (cron, webhook fulfillment, admin grant). For user-scoped
 * reads/writes, prefer the anon client from `createServerSupabase()` so
 * RLS applies.
 */
let _admin: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return _admin;
}
