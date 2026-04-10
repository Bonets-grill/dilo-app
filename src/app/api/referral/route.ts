import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET: Get or create referral code for a user
 * ?userId=xxx → { code, clicks, signups, reward_granted, link }
 *
 * POST: Track referral event
 * { code, event: "click" | "signup", source?, newUserId? }
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // Check if user already has a referral code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase.from("referrals") as any)
      .select("*")
      .eq("referrer_id", userId)
      .single();

    if (existing) {
      return NextResponse.json({
        code: existing.referral_code,
        clicks: existing.clicks,
        signups: existing.signups,
        reward_granted: existing.reward_granted,
        link: `https://ordydilo.com/invite/${existing.referral_code}`,
      });
    }

    // Create new referral code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user } = await (supabase.from("users") as any)
      .select("name")
      .eq("id", userId)
      .single();

    const name = (user?.name || "dilo").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    const code = `${name}-${suffix}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("referrals") as any).insert({
      referrer_id: userId,
      referral_code: code,
    });

    return NextResponse.json({
      code,
      clicks: 0,
      signups: 0,
      reward_granted: false,
      link: `https://ordydilo.com/invite/${code}`,
    });
  } catch (err) {
    console.error("[Referral] GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { code, event, source, newUserId } = await req.json();

    if (!code || !event) {
      return NextResponse.json({ error: "Missing code or event" }, { status: 400 });
    }

    // Verify code exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: referral } = await (supabase.from("referrals") as any)
      .select("id, referrer_id, clicks, signups")
      .eq("referral_code", code)
      .single();

    if (!referral) {
      return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    }

    // IP hash for dedup (privacy-safe)
    const forwarded = req.headers.get("x-forwarded-for") || "unknown";
    const ipHash = crypto.createHash("sha256").update(forwarded).digest("hex").slice(0, 16);

    if (event === "click") {
      // Deduplicate clicks by IP (max 1 per IP per day)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase.from("referral_events") as any)
        .select("id", { count: "exact", head: true })
        .eq("referral_code", code)
        .eq("event_type", "click")
        .eq("ip_hash", ipHash)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString());

      if ((count || 0) === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("referral_events") as any).insert({
          referral_code: code,
          event_type: "click",
          source: source || "direct",
          ip_hash: ipHash,
          user_agent: req.headers.get("user-agent")?.slice(0, 200) || "",
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("referrals") as any)
          .update({ clicks: (referral.clicks || 0) + 1, updated_at: new Date().toISOString() })
          .eq("id", referral.id);
      }
    }

    if (event === "signup" && newUserId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("referral_events") as any).insert({
        referral_code: code,
        event_type: "signup",
        new_user_id: newUserId,
        source: source || "direct",
        ip_hash: ipHash,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("referrals") as any)
        .update({ signups: (referral.signups || 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", referral.id);

      // Mark new user as referred
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("users") as any)
        .update({ referred_by: code })
        .eq("id", newUserId);

      // Check if referrer earned premium (10 signups)
      const newSignups = (referral.signups || 0) + 1;
      if (newSignups >= 10 && !referral.reward_granted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("referrals") as any)
          .update({ reward_granted: true, reward_granted_at: new Date().toISOString() })
          .eq("id", referral.id);

        // Grant premium to referrer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("users") as any)
          .update({ plan: "premium" })
          .eq("id", referral.referrer_id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Referral] POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
