import OpenAI from "openai";

export const TRADING_EMOTIONAL_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "trading_emotional_status",
      description: "Check the trader's current emotional state (tilt, FOMO, revenge, overtrading scores). Use when user asks 'how am I doing emotionally', 'am I tilted', 'should I keep trading', 'my emotional state'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_weekly_report",
      description: "Get the weekly trading performance report with correlations. Use when user asks 'weekly report', 'how was my week', 'reporte semanal', 'cómo me fue esta semana'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_correlations",
      description: "Get trading correlations: best hours, days, setups, symbols. Use when user asks 'what setups work', 'best time to trade', 'my patterns', 'correlaciones'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_kill_zone_status",
      description: "Check if current time is within a trading kill zone (high-liquidity session). Use when user asks 'should I trade now', 'kill zone', 'is it a good time', 'estoy en kill zone'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

export async function executeTradingEmotionalTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    if (toolName === "trading_emotional_status") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("trading_emotional_state") as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return "No tengo datos emocionales aún. Necesito al menos 3 trades hoy para analizar tu estado.";

      const levelIcon = data.emotional_level === "OK" ? "OK" : data.emotional_level === "CAUTION" ? "PRECAUCIÓN" : data.emotional_level === "ALERT" ? "ALERTA" : "STOP";

      let result = `**Estado Emocional: ${levelIcon} (${data.composite_score}/100)**\n\n`;
      result += `| Métrica | Score |\n|---|---|\n`;
      result += `| Tilt | ${data.tilt_score}/100 |\n`;
      result += `| FOMO | ${data.fomo_score}/100 |\n`;
      result += `| Revenge | ${data.revenge_score}/100 |\n`;
      result += `| Overtrading | ${data.overtrading_score}/100 |\n`;
      result += `\nTrades hoy: ${data.trades_today} · Pérdidas: ${data.losses_today} · P&L: $${(data.daily_pnl || 0).toFixed(2)}`;

      if (data.triggers && data.triggers.length > 0) {
        result += `\n\n**Triggers:**\n${data.triggers.map((t: string) => `- ${t}`).join("\n")}`;
      }

      if (data.circuit_breaker_active) {
        result += `\n\n**CIRCUIT BREAKER ACTIVO** — Trading pausado hasta ${data.cooldown_until ? new Date(data.cooldown_until).toLocaleTimeString() : "manual reset"}`;
      }

      return result;
    }

    if (toolName === "trading_weekly_report") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("trading_analytics") as any)
        .select("data")
        .eq("analytics_type", "report")
        .eq("period", "weekly")
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data?.data?.markdown) return "No hay reporte semanal disponible. El cron de analytics corre cada domingo a las 7AM.";
      return data.data.markdown;
    }

    if (toolName === "trading_correlations") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("trading_analytics") as any)
        .select("data")
        .eq("analytics_type", "correlation")
        .eq("period", "weekly")
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data?.data) return "No hay datos de correlaciones. Necesito al menos una semana de señales resueltas.";

      const c = data.data;
      let result = "**Correlaciones de Trading**\n\n";

      if (c.byHour?.length > 0) {
        result += "**Por hora:**\n";
        for (const h of c.byHour.slice(0, 5)) {
          result += `- ${h.label}: ${h.winRate}% WR (${h.trades} trades)\n`;
        }
      }
      if (c.bySetup?.length > 0) {
        result += "\n**Por setup:**\n";
        for (const s of c.bySetup) {
          result += `- ${s.label}: ${s.winRate}% WR (PF: ${s.profitFactor || "?"}, ${s.trades} trades)\n`;
        }
      }
      if (c.bySymbol?.length > 0) {
        result += "\n**Por símbolo:**\n";
        for (const s of c.bySymbol) {
          result += `- ${s.label}: ${s.winRate}% WR ($${s.avgPnl >= 0 ? "+" : ""}${s.avgPnl} avg)\n`;
        }
      }
      return result;
    }

    if (toolName === "trading_kill_zone_status") {
      const { isInKillZone, getNextKillZone } = await import("@/lib/trading/kill-zones");
      const kz = isInKillZone();
      const next = getNextKillZone();

      if (kz.inZone) {
        return `**Dentro de Kill Zone: ${kz.zone}**\nEs buen momento para operar — alta liquidez institucional.`;
      }

      let result = `**Fuera de Kill Zone** (${kz.zone})\nMenor liquidez = mayor riesgo de manipulación.`;
      if (next) {
        const hours = Math.floor(next.startsInMinutes / 60);
        const mins = next.startsInMinutes % 60;
        result += `\nPróxima sesión: **${next.name}** en ${hours}h ${mins}min.`;
      }
      return result;
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    console.error("[Trading Emotional Tool] Error:", err);
    return JSON.stringify({ error: "Error accessing emotional data" });
  }
}
