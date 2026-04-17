import { NextResponse } from "next/server";

/**
 * Centralized error-response helper. Logs the full error + request id to the
 * server, returns a generic payload to the client. Resolves CN-016 — the 31
 * routes that were echoing Supabase/Postgres error.message to callers,
 * leaking column/constraint names.
 *
 *   try {
 *     const { error } = await supa.from("x")...;
 *     if (error) return sanitizeError(error, "route.x.fetch");
 *   } catch (err) { return sanitizeError(err, "route.x.unexpected"); }
 */
export function sanitizeError(err: unknown, context: string, status = 500): NextResponse {
  const reqId = Math.random().toString(36).slice(2, 10);
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${context}] ${reqId}`, msg);
  return NextResponse.json({ error: "internal_error", reqId }, { status });
}
