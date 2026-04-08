import { NextResponse } from "next/server";

export async function GET() {
  // In production (8:00 AM daily):
  // For each active user:
  //   1. Get today's reminders
  //   2. Get unread WhatsApp message count
  //   3. Generate briefing in user's language via Claude Haiku
  //   4. Send via push notification + optional WhatsApp
  //
  // Example briefing (ES):
  //   "Buenos días Mario. Hoy tienes:
  //    - Dentista a las 11:00
  //    - 3 mensajes sin leer de María
  //    - 12 mensajes en el grupo Fútbol"

  console.log("[Cron] Morning briefing executed at:", new Date().toISOString());

  return NextResponse.json({
    status: "ok",
    checked_at: new Date().toISOString(),
    note: "Connect Supabase + Claude to generate real briefings",
  });
}

export const dynamic = "force-dynamic";
