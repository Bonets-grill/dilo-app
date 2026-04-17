import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/require-user";

const supabase = getServiceRoleClient();

/**
 * GET /api/user/export — Export current user's data as JSON (GDPR Art. 20).
 * userId derives from the authenticated session, never from the query string.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const [user, conversations, messages, expenses, reminders, facts, journal, lessons, goals, tradingProfile, tradeJournal, connections] = await Promise.all([
    supabase.from("users").select("name, email, phone, locale, currency, timezone, created_at").eq("id", userId).single(),
    supabase.from("conversations").select("id, title, created_at").eq("user_id", userId),
    supabase.from("messages").select("role, content, created_at").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase.from("expenses").select("amount, category, description, date").eq("user_id", userId),
    supabase.from("reminders").select("text, due_at, status, channel").eq("user_id", userId),
    supabase.from("user_facts").select("category, fact, confidence").eq("user_id", userId),
    supabase.from("user_journal").select("content, dilo_response, mood, category, created_at").eq("user_id", userId),
    supabase.from("user_lessons").select("lesson, category, times_relevant").eq("user_id", userId),
    supabase.from("user_goals").select("goal, status, progress_pct").eq("user_id", userId),
    supabase.from("trading_profiles").select("account_size, account_type, monthly_goal, risk_per_trade_pct, markets, preferred_pairs").eq("user_id", userId),
    supabase.from("trade_journal").select("symbol, side, qty, price, pnl, filled_at").eq("user_id", userId),
    supabase.from("user_connections").select("requester_id, receiver_id, status").or(`requester_id.eq.${userId},receiver_id.eq.${userId}`),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    format: "DILO Data Export (GDPR Art. 20)",
    user: user.data,
    conversations: conversations.data,
    messages: messages.data,
    expenses: expenses.data,
    reminders: reminders.data,
    user_facts: facts.data,
    journal: journal.data,
    lessons: lessons.data,
    goals: goals.data,
    trading_profile: tradingProfile.data,
    trade_journal: tradeJournal.data,
    connections: connections.data,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dilo-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export const dynamic = "force-dynamic";
