import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || webhookSecret === "placeholder") {
    return NextResponse.json({ status: "ok (dev mode)" });
  }

  try {
    const event = JSON.parse(body);

    switch (event.type) {
      case "checkout.session.completed":
      case "invoice.paid":
      case "invoice.payment_failed":
      case "customer.subscription.deleted":
        break;
      default:
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Stripe Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 400 });
  }
}
