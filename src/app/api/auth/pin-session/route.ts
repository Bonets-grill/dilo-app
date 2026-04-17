import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyPinWithUpgrade, isEmailLocked, recordAttempt } from "@/lib/auth/pin";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/auth/pin-session — body { email, pin }
 *
 * Verifies PIN (argon2id, legacy SHA-256 auto-upgraded), then mints a
 * Supabase magic link the client can exchange for a session.
 *
 * Brute-force: 5 failed attempts per email in 15 min → 429.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, pin } = await req.json();
    if (!email || !pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || null;

    if (await isEmailLocked(normalizedEmail)) {
      return NextResponse.json(
        { error: "too_many_attempts", retry_after_s: 900 },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user } = await (supabase.from("users") as any)
      .select("id, email, pin_hash")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!user?.pin_hash) {
      await recordAttempt(normalizedEmail, ip, false);
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const result = await verifyPinWithUpgrade(user.pin_hash, pin, normalizedEmail);
    if (!result.ok) {
      await recordAttempt(normalizedEmail, ip, false);
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    if (result.shouldUpgrade && result.newHash) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("users") as any)
        .update({ pin_hash: result.newHash })
        .eq("id", user.id);
    }

    await recordAttempt(normalizedEmail, ip, true);

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    });

    if (linkError || !linkData) {
      console.error("[PIN Session] Link generation failed:", linkError?.message);
      return NextResponse.json({ error: "Session creation failed" }, { status: 500 });
    }

    const hashedToken = linkData.properties?.hashed_token;
    if (!hashedToken) {
      return NextResponse.json({ error: "Token generation failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      token_hash: hashedToken,
      type: "magiclink",
      userId: user.id,
    });
  } catch (err) {
    console.error("[PIN Session] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
