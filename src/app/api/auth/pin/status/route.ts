import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST: Check if a user has a PIN set
 * { userId } → { hasPin: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("users") as any)
      .select("pin_hash")
      .eq("id", userId)
      .single();

    if (error) {
      return NextResponse.json({ hasPin: false });
    }

    return NextResponse.json({ hasPin: !!data?.pin_hash });
  } catch {
    return NextResponse.json({ hasPin: false });
  }
}
