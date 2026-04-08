import { NextResponse } from "next/server";

export async function GET() {
  // In production: query message_queue WHERE scheduled_at <= now() AND status = 'pending'
  // For each message:
  //   - Get user's channel (whatsapp/telegram)
  //   - Send via Evolution API or Telegram Bot API
  //   - Update status = 'sent', sent_at = now()
  //   - On failure: increment retry_count, status = 'failed' if retry_count >= 3

  console.log("[Cron] Message queue check executed at:", new Date().toISOString());

  return NextResponse.json({
    status: "ok",
    checked_at: new Date().toISOString(),
    note: "Connect Supabase to process message queue",
  });
}

export const dynamic = "force-dynamic";
