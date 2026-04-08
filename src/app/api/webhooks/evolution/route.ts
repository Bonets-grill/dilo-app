import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = body.event;

    if (event === "messages.upsert" || body.data?.messageType) {
      // Incoming WhatsApp message
      const msg = body.data || body;
      const key = msg.key || {};
      const fromMe = key.fromMe;
      const remoteJid = key.remoteJid || "";
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || "";
      const pushName = msg.pushName || "";
      const instanceName = body.instance || body.instanceName || "";

      // Only process incoming messages (not our own)
      if (!fromMe && text) {
        console.log(`[WA IN] From ${pushName} (${phone}): ${text}`);

        // Find user by instance name
        const userId = instanceName.replace("dilo_", "");

        // Save to a simple inbox table or log
        // For now, store as an analytics event so the user can see it
        await supabase.from("analytics_events").insert({
          user_id: userId.length > 8 ? undefined : undefined, // we don't have full UUID from instance name
          event_type: "whatsapp_incoming",
          event_data: {
            from: phone,
            from_name: pushName,
            text,
            instance: instanceName,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    if (event === "connection.update" || body.data?.state) {
      const state = body.data?.state || body.state;
      const instance = body.instance || body.instanceName;
      console.log(`[WA] Connection: ${instance} → ${state}`);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Evolution Webhook] Error:", err);
    return NextResponse.json({ status: "error" }, { status: 200 }); // Always return 200 to avoid retries
  }
}
