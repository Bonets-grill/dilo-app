import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServiceRoleClient } from "@/lib/supabase/service";

const admin = getServiceRoleClient();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;

/**
 * Stripe webhook — signed, idempotent fulfillment.
 *
 * Verifies the `stripe-signature` header against STRIPE_WEBHOOK_SECRET
 * using the official SDK (constructEvent). Without verification, an
 * attacker could POST a forged `checkout.session.completed` event to
 * grant themselves paid skills for free.
 *
 * Handled events:
 *   checkout.session.completed — grant user_skills row with course slug
 *
 * Idempotency: every processed event id is recorded in webhook_events.
 * Replays are a no-op.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  // Dev/placeholder bypass: if keys aren't configured, log-and-ignore.
  if (!stripe || !STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET === "placeholder") {
    return NextResponse.json({ status: "ok (dev mode — webhook secret not set)" });
  }
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe.webhook] signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // Idempotency — best effort. If the table doesn't exist we still process,
  // just without dedup.
  try {
    const { data: already } = await admin
      .from("webhook_events")
      .select("id")
      .eq("source", "stripe")
      .eq("event_id", event.id)
      .maybeSingle();
    if (already) return NextResponse.json({ status: "already_processed" });
  } catch { /* table may not exist; proceed */ }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId;
      const courseSlug = session.metadata?.courseSlug;
      if (userId && courseSlug) {
        const skillId = `course_${courseSlug.replace(/-/g, "_")}`;
        await admin
          .from("user_skills")
          .upsert(
            { user_id: userId, skill_id: skillId, status: "active" },
            { onConflict: "user_id,skill_id" }
          );
      }
    }

    try {
      await admin
        .from("webhook_events")
        .insert({ source: "stripe", event_id: event.id, event_type: event.type });
    } catch { /* table may not exist */ }

    return NextResponse.json({ status: "ok", type: event.type });
  } catch (err) {
    console.error("[stripe.webhook] handler error", err);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
