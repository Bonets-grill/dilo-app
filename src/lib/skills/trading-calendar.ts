/**
 * Trading Calendar — Visual calendar of wins/losses + liquidity sweep detection
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ══════════════════════════════════════
// TOOLS
// ══════════════════════════════════════

export const TRADING_CALENDAR_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "trading_calendar",
      description: "Show the trading calendar with daily P&L, win/loss days, streaks, and monthly summary. Use when user asks about their calendar, history, results this month, streak, etc.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number", description: "Month (1-12). Default: current month" },
          year: { type: "number", description: "Year. Default: current year" },
        },
        required: [],
      },
    },
  },
];

// ══════════════════════════════════════
// EXECUTION
// ══════════════════════════════════════

export async function executeTradingCalendar(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string> {
  if (toolName === "trading_calendar") {
    return doCalendar(userId, input.month as number | undefined, input.year as number | undefined);
  }
  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

async function doCalendar(userId: string, month?: number, year?: number): Promise<string> {
  const now = new Date();
  const m = month || (now.getMonth() + 1);
  const y = year || now.getFullYear();

  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);
  const daysInMonth = lastDay.getDate();

  // Get snapshots for this month
  const { data: snapshots } = await supabase
    .from("trade_snapshots")
    .select("date, day_pnl, day_pnl_pct, trades_count, portfolio_value")
    .eq("user_id", userId)
    .gte("date", `${y}-${String(m).padStart(2, "0")}-01`)
    .lte("date", `${y}-${String(m).padStart(2, "0")}-${daysInMonth}`)
    .order("date", { ascending: true });

  // Also get from trade_journal for days without snapshots
  const { data: journalDays } = await supabase
    .from("trade_journal")
    .select("filled_at, pnl, side")
    .eq("user_id", userId)
    .gte("filled_at", `${y}-${String(m).padStart(2, "0")}-01`)
    .lte("filled_at", `${y}-${String(m).padStart(2, "0")}-${daysInMonth}T23:59:59`)
    .eq("side", "sell")
    .not("pnl", "is", null);

  // Build daily P&L map
  const dayPnl: Record<number, { pnl: number; trades: number }> = {};

  // From snapshots
  if (snapshots) {
    for (const s of snapshots) {
      const day = parseInt(s.date.split("-")[2]);
      dayPnl[day] = { pnl: s.day_pnl || 0, trades: s.trades_count || 0 };
    }
  }

  // From journal (supplement missing days)
  if (journalDays) {
    for (const j of journalDays) {
      const day = new Date(j.filled_at).getDate();
      if (!dayPnl[day]) dayPnl[day] = { pnl: 0, trades: 0 };
      dayPnl[day].pnl += j.pnl || 0;
      dayPnl[day].trades += 1;
    }
  }

  // Month names in Spanish
  const monthNames = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  let result = `**📅 Calendario de Trading — ${monthNames[m]} ${y}**\n\n`;

  // Calendar header
  result += `| Lu | Ma | Mi | Ju | Vi | Sa | Do |\n|---|---|---|---|---|---|---|\n`;

  // Calculate first day offset (Monday = 0)
  let startDay = firstDay.getDay(); // 0=Sun, 1=Mon...
  startDay = startDay === 0 ? 6 : startDay - 1; // Convert to Mon=0

  // Build calendar rows
  let dayNum = 1;
  for (let week = 0; week < 6; week++) {
    if (dayNum > daysInMonth) break;
    let row = "|";
    for (let dow = 0; dow < 7; dow++) {
      if ((week === 0 && dow < startDay) || dayNum > daysInMonth) {
        row += " |";
      } else {
        const d = dayPnl[dayNum];
        if (d && d.trades > 0) {
          const icon = d.pnl >= 0 ? "🟢" : "🔴";
          const sign = d.pnl >= 0 ? "+" : "";
          row += ` ${icon}${dayNum} ${sign}${d.pnl.toFixed(0)}€ |`;
        } else if (dow >= 5) {
          // Weekend
          row += ` ${dayNum} |`;
        } else {
          row += ` ${dayNum} — |`;
        }
        dayNum++;
      }
    }
    result += row + "\n";
  }

  // Monthly stats
  const tradingDays = Object.values(dayPnl).filter(d => d.trades > 0);
  const winDays = tradingDays.filter(d => d.pnl > 0);
  const lossDays = tradingDays.filter(d => d.pnl <= 0);
  const totalPnl = tradingDays.reduce((s, d) => s + d.pnl, 0);
  const totalTrades = tradingDays.reduce((s, d) => s + d.trades, 0);
  const bestDay = tradingDays.length > 0 ? Math.max(...tradingDays.map(d => d.pnl)) : 0;
  const worstDay = tradingDays.length > 0 ? Math.min(...tradingDays.map(d => d.pnl)) : 0;
  const avgWinDay = winDays.length > 0 ? winDays.reduce((s, d) => s + d.pnl, 0) / winDays.length : 0;
  const avgLossDay = lossDays.length > 0 ? Math.abs(lossDays.reduce((s, d) => s + d.pnl, 0) / lossDays.length) : 0;

  // Win/loss streak
  let curStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
  const sortedDays = Object.entries(dayPnl)
    .filter(([, d]) => d.trades > 0)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  for (const [, d] of sortedDays) {
    if (d.pnl > 0) {
      curStreak = curStreak > 0 ? curStreak + 1 : 1;
      maxWinStreak = Math.max(maxWinStreak, curStreak);
    } else {
      curStreak = curStreak < 0 ? curStreak - 1 : -1;
      maxLossStreak = Math.max(maxLossStreak, Math.abs(curStreak));
    }
  }

  result += `\n**Resumen del mes:**\n\n`;
  result += `| Métrica | Valor |\n|---|---|\n`;
  result += `| P&L total | ${totalPnl >= 0 ? "🟢 +" : "🔴 "}€${Math.abs(totalPnl).toFixed(0)} |\n`;
  result += `| Días operados | ${tradingDays.length} |\n`;
  result += `| Días ganadores | 🟢 ${winDays.length} (${tradingDays.length > 0 ? (winDays.length / tradingDays.length * 100).toFixed(0) : 0}%) |\n`;
  result += `| Días perdedores | 🔴 ${lossDays.length} |\n`;
  result += `| Trades totales | ${totalTrades} |\n`;
  result += `| Mejor día | +€${bestDay.toFixed(0)} |\n`;
  result += `| Peor día | -€${Math.abs(worstDay).toFixed(0)} |\n`;
  result += `| Media día ganador | +€${avgWinDay.toFixed(0)} |\n`;
  result += `| Media día perdedor | -€${avgLossDay.toFixed(0)} |\n`;
  result += `| Mejor racha | ${maxWinStreak} días seguidos |\n`;
  result += `| Peor racha | ${maxLossStreak} días seguidos |\n`;

  if (tradingDays.length === 0) {
    result += `\n_No hay datos de trading para este mes. Opera y los datos aparecerán aquí automáticamente._`;
  }

  return result;
}
