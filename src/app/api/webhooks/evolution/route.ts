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
      const instanceId = body.instanceId || msg.instanceId || "";

      if (!fromMe && text) {
        console.log(`[WA IN] From ${pushName} (${phone}): ${text}`);

        // Find user by instance
        const { data: channel } = await supabase
          .from("channels")
          .select("user_id")
          .eq("instance_id", instanceId)
          .single();

        const userId = channel?.user_id;

        // Store incoming message
        await supabase.from("analytics_events").insert({
          user_id: userId || null,
          event_type: "whatsapp_incoming",
          event_data: {
            from_phone: phone,
            from_name: pushName,
            text,
            instance_id: instanceId,
            timestamp: new Date().toISOString(),
          },
        });

        // TODO: Send push notification to user about incoming message
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Evolution Webhook] Error:", err);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
