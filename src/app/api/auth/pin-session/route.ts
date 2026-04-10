import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashPin(pin: string, email: string): string {
  return crypto.createHash("sha256").update(`${pin}:${email.toLowerCase()}`).digest("hex");
}

/**
 * POST: Verify PIN and generate a magic link for session creation
 * { email, pin } → { token, redirect } or { error }
 *
 * Flow:
 * 1. Verify PIN hash against DB
 * 2. Use admin API to generate a magic link
 * 3. Return the token so the client can exchange it for a session
 */
export async function POST(req: NextRequest) {
  try {
    const { email, pin } = await req.json();

    if (!email || !pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const hash = hashPin(pin, normalizedEmail);

    // Verify PIN against DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user } = await (supabase.from("users") as any)
      .select("id, email, pin_hash")
      .eq("email", normalizedEmail)
      .eq("pin_hash", hash)
      .single();

    if (!user) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // Generate magic link using admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    });

    if (linkError || !linkData) {
      console.error("[PIN Session] Link generation failed:", linkError?.message);
      return NextResponse.json({ error: "Session creation failed" }, { status: 500 });
    }

    // Extract the token from the generated link
    const properties = linkData.properties;
    const hashedToken = properties?.hashed_token;

    if (!hashedToken) {
      return NextResponse.json({ error: "Token generation failed" }, { status: 500 });
    }

    // Return token details for client-side verification
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
