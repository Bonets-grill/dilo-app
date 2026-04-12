import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function hashPin(pin: string, email: string): string {
  return crypto.createHash("sha256").update(`${pin}:${email.toLowerCase()}`).digest("hex");
}

/**
 * POST: Set or verify PIN
 * { action: "set", userId, email, pin } — save PIN hash
 * { action: "verify", email, pin } — verify PIN, return userId
 */
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { action, userId, email, pin } = body;

  if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });
  }

  if (action === "set") {
    if (!userId || !email) return NextResponse.json({ error: "Missing userId or email" }, { status: 400 });

    const hash = hashPin(pin, email);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("users") as any)
      .update({ pin_hash: hash })
      .eq("id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const hash = hashPin(pin, email);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("users") as any)
      .select("id, email, pin_hash")
      .eq("email", email.toLowerCase())
      .eq("pin_hash", hash)
      .single();

    if (!data) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    return NextResponse.json({ ok: true, userId: data.id, email: data.email });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
