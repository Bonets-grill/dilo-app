import { NextRequest } from "next/server";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getServiceRoleClient } from "@/lib/supabase/service";

/**
 * Admin auth — session-token model.
 *
 * Flow:
 *   POST /api/admin/login  — body { secret }
 *     1. `secret` compared to ADMIN_SECRET with timingSafeEqual.
 *     2. On success, generate 32 random bytes → hex token.
 *     3. Store SHA-256(token) in admin_sessions with 12h expiry.
 *     4. Set cookie `dilo_admin_session` = raw token, httpOnly, Secure, Strict.
 *
 *   requireAdmin(req) — reads cookie token, hashes, looks up in DB,
 *     checks expires_at. Updates last_used_at. Returns true/false.
 *
 * Difference vs legacy: cookie no longer carries the raw ADMIN_SECRET.
 * Leaked cookie = one 12h session, not the permanent secret.
 */
export const ADMIN_COOKIE = "dilo_admin_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateAdminToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

export function verifyAdminSecret(provided: string): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  // Constant-time compare
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function requireAdmin(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie || cookie.length < 32) return false;
  const admin = getServiceRoleClient();
  const { data } = await admin
    .from("admin_sessions")
    .select("id, expires_at")
    .eq("token_hash", hashToken(cookie))
    .maybeSingle();
  if (!data) return false;
  if (new Date(data.expires_at) < new Date()) {
    try { await admin.from("admin_sessions").delete().eq("id", data.id); } catch { /* */ }
    return false;
  }
  // Fire-and-forget touch of last_used_at
  admin.from("admin_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", data.id)
    .then(() => {}, () => {});
  return true;
}

export async function destroyAdminSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const admin = getServiceRoleClient();
  try { await admin.from("admin_sessions").delete().eq("token_hash", hashToken(token)); } catch { /* */ }
}

export function adminForbidden() {
  return new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
