import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || webhookSecret === "placeholder") {
    console.log("[Stripe Webhook] No webhook secret configured, skipping verification");
    return NextResponse.json({ status: "ok (dev mode)" });
  }

  try {
    // In production: verify signature with Stripe SDK
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    // const event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);

    const event = JSON.parse(body);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const skillId = session.metadata?.skill_id;
        const packId = session.metadata?.pack_id;

        console.log(`[Stripe] Checkout completed: user=${userId}, skill=${skillId}, pack=${packId}`);

        // In production: create user_skills entries
        // if (skillId) await activateSkill(userId, skillId, session.subscription);
        // if (packId) await activatePack(userId, packId, session.subscription);
        break;
      }

      case "invoice.paid": {
        console.log("[Stripe] Invoice paid — subscription renewed");
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log(`[Stripe] Payment failed for subscription: ${invoice.subscription}`);
        // In production: update user_skills status to 'past_due'
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log(`[Stripe] Subscription cancelled: ${subscription.id}`);
        // In production: deactivate user_skills
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event: ${event.type}`);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Stripe Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 400 });
  }
}
