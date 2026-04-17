import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

/**
 * POST /api/user/delete — Delete all user data and account (GDPR Art. 17 right to erasure)
 * Body: { userId: string, confirm: true }
 */
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { userId, confirm } = body;
  if (!userId || confirm !== true) {
    return NextResponse.json({ error: "Missing userId or confirmation" }, { status: 400 });
  }

  try {
    // Delete in order (respecting foreign keys — CASCADE handles most)
    // But we explicitly delete to be thorough
    const tables = [
      "direct_messages",
      "user_connections",
      "proactive_insights",
      "whatsapp_tracking",
      "location_history",
      "emergency_contacts",
      "user_journal",
      "user_lessons",
      "user_goals",
      "consent_log",
      "trading_signal_log",
      "trading_knowledge",
      "trading_learning_stats",
      "trading_profiles",
      "trading_rules",
      "trade_journal",
      "trade_snapshots",
      "push_subscriptions",
      "analytics_events",
      "user_facts",
      "expenses",
      "reminders",
      "messages",
      "conversations",
      "channels",
      "user_skills",
    ];

    for (const table of tables) {
      await supabase.from(table).delete().eq("user_id", userId);
    }

    // Finally delete the user record itself
    await supabase.from("users").delete().eq("id", userId);

    // Delete from auth.users (Supabase Auth)
    await supabase.auth.admin.deleteUser(userId);

    return NextResponse.json({ ok: true, message: "All data deleted permanently" });
  } catch (err) {
    console.error("[Delete User] Error:", err);
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
