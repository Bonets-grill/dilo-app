import { NextRequest, NextResponse } from "next/server";

/**
 * Gate cron routes. Either Vercel's own cron signal (x-vercel-cron header)
 * or a Bearer token matching CRON_SECRET is accepted. Everyone else gets
 * 401 — prevents random internet traffic from force-triggering expensive
 * per-user LLM loops.
 *
 * Usage at the top of every cron route:
 *   const gate = requireCronAuth(req); if (gate) return gate;
 */
export function requireCronAuth(req: NextRequest): NextResponse | null {
  if (req.headers.get("x-vercel-cron")) return null;
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && auth === expected) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
