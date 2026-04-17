import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPin, verifyPinWithUpgrade, isEmailLocked, recordAttempt } from "@/lib/auth/pin";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

/**
 * POST /api/auth/pin
 *   { action: "set", userId, email, pin } — store argon2id hash
 *   { action: "verify", email, pin }       — return userId (with lockout)
 *
 * Hash: argon2id (CN-005). Legacy SHA-256 PINs are accepted once and
 * transparently re-hashed on first successful verify (opportunistic
 * migration, zero user friction).
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; userId?: string; email?: string; pin?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { action, userId, email, pin } = body;

  if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;

  if (action === "set") {
    if (!userId || !email) return NextResponse.json({ error: "Missing userId or email" }, { status: 400 });
    const normalizedEmail = email.toLowerCase().trim();
    const hash = await hashPin(pin, normalizedEmail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("users") as any)
      .upsert({ id: userId, email: normalizedEmail, pin_hash: hash }, { onConflict: "id" });
    if (error) {
      console.error("[pin.set]", error.message);
      return NextResponse.json({ error: "set_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    const normalizedEmail = email.toLowerCase().trim();

    // Brute-force gate
    if (await isEmailLocked(normalizedEmail)) {
      return NextResponse.json(
        { error: "too_many_attempts", retry_after_s: 900 },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("users") as any)
      .select("id, email, pin_hash")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!data?.pin_hash) {
      await recordAttempt(normalizedEmail, ip, false);
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const result = await verifyPinWithUpgrade(data.pin_hash, pin, normalizedEmail);
    if (!result.ok) {
      await recordAttempt(normalizedEmail, ip, false);
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    if (result.shouldUpgrade && result.newHash) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("users") as any)
        .update({ pin_hash: result.newHash })
        .eq("id", data.id);
    }

    await recordAttempt(normalizedEmail, ip, true);
    return NextResponse.json({ ok: true, userId: data.id, email: data.email });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
