import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/voice/execute-tool
 * Body: { userId, toolName, args }
 *
 * When the Realtime model emits a function_call event, the client posts
 * here. We execute against Supabase / Gmail / etc. and return the result
 * as a JSON string, which the client then feeds back to the model via
 * conversation.item.create + response.create.
 *
 * Scoped to "core" tools that make sense over voice — reminders, expenses,
 * basic queries. Browser automation / email sending require visual
 * confirmation and stay text-only.
 */
export async function POST(req: NextRequest) {
  const { userId, toolName, args } = (await req.json()) as {
    userId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
  };

  if (!userId || !toolName) {
    return NextResponse.json({ error: "Missing userId or toolName" }, { status: 400 });
  }

  try {
    const a = args || {};

    // CREATE REMINDER
    if (toolName === "create_reminder") {
      const text = String(a.text || "").trim();
      const due_at = String(a.due_at || "").trim();
      if (!text || !due_at) {
        return NextResponse.json({ result: JSON.stringify({ error: "missing_fields" }) });
      }
      // Validate datetime is valid AND in the future (prevents the classic
      // "LLM forgot timezone offset → reminder fires immediately" bug).
      const parsed = new Date(due_at).getTime();
      if (isNaN(parsed)) {
        return NextResponse.json({
          result: JSON.stringify({ error: "invalid_due_at", message: "due_at inválido. Usa ISO 8601 con offset." }),
        });
      }
      if (parsed <= Date.now() + 30_000) {
        return NextResponse.json({
          result: JSON.stringify({
            error: "due_at_in_past",
            message: `Esa hora ya pasó. Ahora: ${new Date().toISOString()}. Recalcula con el offset del usuario e inténtalo otra vez.`,
          }),
        });
      }
      const { data, error } = await supabase
        .from("reminders")
        .insert({ user_id: userId, text, due_at })
        .select("id, text, due_at")
        .single();
      if (error) {
        return NextResponse.json({ result: JSON.stringify({ error: error.message }) });
      }
      return NextResponse.json({
        result: JSON.stringify({ success: true, reminder: data }),
      });
    }

    // LIST REMINDERS
    if (toolName === "list_reminders") {
      const { data: pending } = await supabase
        .from("reminders")
        .select("id, text, due_at, status")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("due_at", { ascending: true })
        .limit(10);
      return NextResponse.json({ result: JSON.stringify({ pending: pending || [] }) });
    }

    // CANCEL REMINDER (fuzzy match by text)
    if (toolName === "cancel_reminder") {
      const textMatch = String(a.text_match || "").trim().toLowerCase();
      if (!textMatch) {
        return NextResponse.json({ result: JSON.stringify({ error: "missing_text_match" }) });
      }
      const { data: reminders } = await supabase
        .from("reminders")
        .select("id, text")
        .eq("user_id", userId)
        .eq("status", "pending");
      const match = (reminders || []).find((r) => r.text.toLowerCase().includes(textMatch));
      if (!match) {
        return NextResponse.json({ result: JSON.stringify({ error: "no_match" }) });
      }
      await supabase.from("reminders").update({ status: "cancelled" }).eq("id", match.id);
      return NextResponse.json({ result: JSON.stringify({ success: true, cancelled: match }) });
    }

    // CREATE EXPENSE
    if (toolName === "create_expense") {
      const amount = Number(a.amount);
      const description = String(a.description || "").trim();
      const category = String(a.category || "otros").trim();
      if (!amount || !description) {
        return NextResponse.json({ result: JSON.stringify({ error: "missing_fields" }) });
      }
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          user_id: userId,
          amount,
          currency: "EUR",
          category,
          description,
          date: new Date().toISOString().split("T")[0],
        })
        .select("id, amount, description")
        .single();
      if (error) {
        return NextResponse.json({ result: JSON.stringify({ error: error.message }) });
      }
      return NextResponse.json({ result: JSON.stringify({ success: true, expense: data }) });
    }

    // LIST EXPENSES (today / week / month)
    if (toolName === "list_expenses") {
      const period = String(a.period || "today");
      const now = new Date();
      let since: Date;
      if (period === "week") {
        since = new Date(now.getTime() - 7 * 86400000);
      } else if (period === "month") {
        since = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
      const { data } = await supabase
        .from("expenses")
        .select("amount, description, category, date")
        .eq("user_id", userId)
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: false });
      const total = (data || []).reduce((s, e) => s + Number(e.amount || 0), 0);
      return NextResponse.json({
        result: JSON.stringify({ period, total, count: data?.length || 0, items: data || [] }),
      });
    }

    return NextResponse.json({
      result: JSON.stringify({ error: "unsupported_tool", toolName }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ result: JSON.stringify({ error: msg }) });
  }
}

export const dynamic = "force-dynamic";
