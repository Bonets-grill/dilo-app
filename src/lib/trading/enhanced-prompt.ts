/**
 * Enhanced Trading Prompt — Injects emotional state + correlations into system prompt
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get emotional context for the system prompt
 */
export async function getEmotionalContext(userId: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("trading_emotional_state") as any)
      .select("emotional_level, composite_score, tilt_score, fomo_score, revenge_score, triggers, circuit_breaker_active")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data || data.emotional_level === "OK") return "";

    let context = `\nESTADO EMOCIONAL DEL TRADER: ${data.emotional_level} (${data.composite_score}/100)`;
    if (data.circuit_breaker_active) context += " — CIRCUIT BREAKER ACTIVO";
    if (data.triggers && data.triggers.length > 0) {
      context += `\nTriggers: ${data.triggers.slice(0, 3).join(". ")}`;
    }
    context += "\nSi el usuario quiere operar, ADVIERTE sobre su estado emocional.";
    return context;
  } catch {
    return "";
  }
}

/**
 * Get trader insights from analytics for the system prompt
 */
export async function getTraderInsights(userId: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("trading_analytics") as any)
      .select("data")
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq("analytics_type", "correlation")
      .eq("period", "weekly")
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data?.data) return "";

    const correlations = data.data;
    const parts: string[] = ["\nCORRELACIONES DE TRADING:"];

    if (correlations.byHour?.[0]) {
      parts.push(`Mejor hora: ${correlations.byHour[0].label} (${correlations.byHour[0].winRate}% WR)`);
    }
    if (correlations.bySetup?.[0]) {
      parts.push(`Mejor setup: ${correlations.bySetup[0].label} (${correlations.bySetup[0].winRate}% WR)`);
    }
    if (correlations.bySymbol?.[0]) {
      parts.push(`Mejor símbolo: ${correlations.bySymbol[0].label} (${correlations.bySymbol[0].winRate}% WR)`);
    }

    // Worst performers (to warn)
    const worstSymbol = correlations.bySymbol?.[correlations.bySymbol.length - 1];
    if (worstSymbol && worstSymbol.winRate < 40) {
      parts.push(`EVITAR: ${worstSymbol.label} (${worstSymbol.winRate}% WR)`);
    }

    return parts.length > 1 ? parts.join("\n") : "";
  } catch {
    return "";
  }
}
