import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = body.event;

    // Handle different Evolution API events
    switch (event) {
      case "connection.update": {
        const { state, instance } = body.data || body;
        console.log(`[Evolution] Connection update: ${instance} → ${state}`);
        // In production: update channels table via service client
        // await updateChannelStatus(instance, state);
        break;
      }

      case "qrcode.updated": {
        const { qrcode, instance } = body.data || body;
        console.log(`[Evolution] QR updated for: ${instance}`);
        // In production: update channels.qr_code via service client
        break;
      }

      case "messages.upsert": {
        const { instance } = body;
        const messages = body.data || [];
        console.log(`[Evolution] New message(s) for: ${instance}, count: ${Array.isArray(messages) ? messages.length : 1}`);
        // In production: optionally process incoming messages
        // (auto-reply if configured, or just log)
        break;
      }

      default:
        console.log(`[Evolution] Unknown event: ${event}`);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Evolution Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
