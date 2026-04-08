import { NextResponse } from "next/server";

export async function GET() {
  // In production: query reminders WHERE due_at <= now() AND status = 'pending'
  // For each reminder:
  //   - If channel = 'push' → send via Web Push
  //   - If channel = 'whatsapp' → send via Evolution API
  //   - If channel = 'telegram' → send via Telegram Bot API
  //   - Increment repeats_sent
  //   - If repeats_sent >= repeat_count → status = 'sent'
  //   - If repeat_type = 'daily'/'weekly'/'monthly' → reschedule due_at

  console.log("[Cron] Reminders check executed at:", new Date().toISOString());

  return NextResponse.json({
    status: "ok",
    checked_at: new Date().toISOString(),
    note: "Connect Supabase to process real reminders",
  });
}

// Vercel Cron config in vercel.json
export const dynamic = "force-dynamic";
