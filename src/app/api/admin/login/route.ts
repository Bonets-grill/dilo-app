import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  generateAdminToken,
  verifyAdminSecret,
  destroyAdminSession,
} from "@/lib/admin/auth";
import { getServiceRoleClient } from "@/lib/supabase/service";

/**
 * POST /api/admin/login — body { secret }
 *   Verifies secret against ADMIN_SECRET (timing-safe).
 *   On success: creates a random session token, stores SHA-256 hash +
 *   12h expiry in admin_sessions, sets the token as httpOnly/Secure
 *   SameSite=Strict cookie. A leaked cookie is now just a 12h session,
 *   not the permanent secret.
 *
 * Rate limit: 5 failed attempts per IP in 15 minutes → 429.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  const admin = getServiceRoleClient();

  // Brute-force gate: 5 failed attempts / 15 min / IP
  try {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("succeeded", false)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) {
      return NextResponse.json(
        { error: "too_many_attempts", retry_after_s: 900 },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }
  } catch { /* login_attempts table may not exist yet; fall through */ }

  const body = await req.json().catch(() => ({} as { secret?: string }));
  const secret = typeof body?.secret === "string" ? body.secret : "";

  if (!verifyAdminSecret(secret)) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      await admin.from("login_attempts").insert({ email: "admin", ip, succeeded: false });
    } catch { /* */ }
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  // Success — create session
  const { token, tokenHash, expiresAt } = generateAdminToken();
  try {
    await admin.from("admin_sessions").insert({
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      user_agent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
      ip,
    });
  } catch (err) {
    console.error("[admin.login] session insert failed", err);
    return NextResponse.json({ error: "session_store_failed" }, { status: 500 });
  }

  try {
    await admin.from("login_attempts").insert({ email: "admin", ip, succeeded: true });
  } catch { /* */ }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  const existing = req.cookies.get(ADMIN_COOKIE)?.value;
  await destroyAdminSession(existing);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

export const dynamic = "force-dynamic";
