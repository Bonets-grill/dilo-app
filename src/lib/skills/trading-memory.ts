import OpenAI from "openai";
import { queryMemory } from "@/lib/trading/memory";

export const TRADING_MEMORY_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "trading_memory",
      description: "Check DILO's trading memory and historical performance for a specific symbol or pattern. Use when user asks 'how do I perform on AAPL', 'what is my best setup', 'should I trade TSLA', 'my trading history'.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading symbol: AAPL, XAU/USD, EUR/USD, etc." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_insights",
      description: "Get DILO's weekly trading insights and discovered patterns. Use when user asks 'what have you learned', 'trading insights', 'my patterns', 'what works'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

export async function executeTradingMemoryTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (toolName === "trading_memory") {
      const symbol = (input.symbol as string || "").toUpperCase();
      const marketType = symbol.includes("/") ? (symbol.includes("XAU") ? "gold" : "forex") : "stocks";

      const memory = await queryMemory(symbol, "all", marketType);

      // Get all patterns for this symbol
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: patterns } = await (supabase.from("trading_patterns") as any)
        .select("setup_type, win_rate, total_signals, pattern_type, avg_pnl, confidence_adjustment")
        .eq("symbol", symbol)
        .gt("total_signals", 3)
        .order("win_rate", { ascending: false });

      let result = `**Memoria de DILO — ${symbol}**\n\n`;

      if (!patterns || patterns.length === 0) {
        result += `No tengo suficientes datos sobre ${symbol} todavía. Necesito más señales resueltas.\n`;
        result += `\nSeñales totales para ${symbol}: ${memory.symbolTotalSignals}`;
      } else {
        result += `| Setup | Win Rate | Señales | P&L Avg | Ajuste |\n|---|---|---|---|---|\n`;
        for (const p of patterns) {
          const icon = p.pattern_type === "strong" ? "+" : p.pattern_type === "weak" ? "-" : "~";
          result += `| ${icon} ${p.setup_type} | ${p.win_rate}% | ${p.total_signals} | ${p.avg_pnl >= 0 ? "+" : ""}${p.avg_pnl?.toFixed(2)} | ${p.confidence_adjustment >= 0 ? "+" : ""}${p.confidence_adjustment} |\n`;
        }

        if (memory.recentWinRate !== null) {
          result += `\n**Últimas 20 señales:** ${memory.recentWinRate}% win rate`;
          if (memory.recentStreak !== 0) {
            result += ` · Racha: ${memory.recentStreak > 0 ? `+${memory.recentStreak} wins` : `${memory.recentStreak} losses`}`;
          }
        }

        if (memory.warnings.length > 0) {
          result += `\n\n**Advertencias:**\n${memory.warnings.map(w => `- ${w}`).join("\n")}`;
        }
      }

      return result;
    }

    if (toolName === "trading_insights") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: insights } = await (supabase.from("trading_insights") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (!insights || insights.length === 0) {
        return "No tengo insights todavía. El cron de descubrimiento de patrones corre cada domingo — necesito al menos 1-2 semanas de datos.";
      }

      let result = "**DILO Trading Insights**\n\n";
      for (const i of insights) {
        const icon = i.insight_type === "best_setup" ? "[BEST]" : i.insight_type === "worst_setup" ? "[WORST]" : "[INFO]";
        result += `${icon} **${i.title}**\n${i.description}\n_${new Date(i.created_at).toLocaleDateString()}_\n\n`;
      }

      return result;
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    console.error("[Trading Memory Tool] Error:", err);
    return JSON.stringify({ error: "Error accessing trading memory" });
  }
}
