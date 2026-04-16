import { NextRequest } from "next/server";

/**
 * Admin auth — minimalist. The cookie `dilo_admin_secret` holds the literal
 * ADMIN_SECRET value, set server-side as httpOnly after successful login.
 * Any /api/admin/* endpoint calls requireAdmin() which compares cookie ==
 * process.env.ADMIN_SECRET. Fails closed.
 */
export const ADMIN_COOKIE = "dilo_admin_secret";

export function requireAdmin(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return cookie === expected;
}

export function adminForbidden() {
  return new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
