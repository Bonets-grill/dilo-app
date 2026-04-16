import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin/auth";

/**
 * POST /api/admin/login
 * Body: { secret }
 * If secret === ADMIN_SECRET env var: sets an httpOnly cookie that the other
 * admin endpoints validate. Cookie expires in 12h.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }

  const { secret } = await req.json().catch(() => ({}));
  if (secret !== expected) {
    // Tiny delay to slow brute force
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}

/**
 * DELETE /api/admin/login
 * Clears the admin session cookie.
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

export const dynamic = "force-dynamic";
