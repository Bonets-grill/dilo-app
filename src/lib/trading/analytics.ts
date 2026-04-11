/**
 * Trading Analytics — Correlation analysis and weekly reports
 *
 * Analyzes resolved signals to find patterns:
 * - Best/worst hours, days, setups, regimes, symbols
 * - Hold time correlation with win rate
 * - Generates actionable weekly reports
 */

interface SignalData {
  symbol: string;
  side: string;
  setup_type: string;
  outcome: string;
  pnl: number | null;
  r_multiple: number | null;
  hold_time_hours: number | null;
  entry_hour_utc: number | null;
  entry_day_of_week: number | null;
  regime_at_entry: string | null;
  market_type: string | null;
  created_at: string;
}

interface CorrelationEntry {
  label: string;
  winRate: number;
  trades: number;
  avgPnl: number;
  profitFactor?: number;
}

export function analyzeByHour(signals: SignalData[]): CorrelationEntry[] {
  const buckets = new Map<number, SignalData[]>();
  for (const s of signals) {
    const hour = s.entry_hour_utc ?? new Date(s.created_at).getUTCHours();
    if (!buckets.has(hour)) buckets.set(hour, []);
    buckets.get(hour)!.push(s);
  }

  return [...buckets.entries()]
    .filter(([, sigs]) => sigs.length >= 3)
    .map(([hour, sigs]) => ({
      label: `${hour.toString().padStart(2, "0")}:00`,
      winRate: Math.round((sigs.filter(s => s.outcome === "win").length / sigs.length) * 1000) / 10,
      trades: sigs.length,
      avgPnl: Math.round(sigs.reduce((s, sig) => s + (sig.pnl || 0), 0) / sigs.length * 100) / 100,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}

export function analyzeByDayOfWeek(signals: SignalData[]): CorrelationEntry[] {
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const buckets = new Map<number, SignalData[]>();
  for (const s of signals) {
    const day = s.entry_day_of_week ?? new Date(s.created_at).getUTCDay();
    if (!buckets.has(day)) buckets.set(day, []);
    buckets.get(day)!.push(s);
  }

  return [...buckets.entries()]
    .filter(([, sigs]) => sigs.length >= 3)
    .map(([day, sigs]) => ({
      label: days[day] || `Día ${day}`,
      winRate: Math.round((sigs.filter(s => s.outcome === "win").length / sigs.length) * 1000) / 10,
      trades: sigs.length,
      avgPnl: Math.round(sigs.reduce((s, sig) => s + (sig.pnl || 0), 0) / sigs.length * 100) / 100,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}

export function analyzeBySetup(signals: SignalData[]): CorrelationEntry[] {
  const buckets = new Map<string, SignalData[]>();
  for (const s of signals) {
    const setup = s.setup_type || "unknown";
    if (!buckets.has(setup)) buckets.set(setup, []);
    buckets.get(setup)!.push(s);
  }

  return [...buckets.entries()]
    .filter(([, sigs]) => sigs.length >= 3)
    .map(([setup, sigs]) => {
      const wins = sigs.filter(s => s.outcome === "win");
      const losses = sigs.filter(s => s.outcome === "loss");
      const totalWinPnl = wins.reduce((s, sig) => s + Math.abs(sig.pnl || 0), 0);
      const totalLossPnl = losses.reduce((s, sig) => s + Math.abs(sig.pnl || 0), 0);
      return {
        label: setup,
        winRate: Math.round((wins.length / sigs.length) * 1000) / 10,
        trades: sigs.length,
        avgPnl: Math.round(sigs.reduce((s, sig) => s + (sig.pnl || 0), 0) / sigs.length * 100) / 100,
        profitFactor: totalLossPnl > 0 ? Math.round(totalWinPnl / totalLossPnl * 100) / 100 : totalWinPnl > 0 ? 999 : 0,
      };
    })
    .sort((a, b) => b.winRate - a.winRate);
}

export function analyzeBySymbol(signals: SignalData[]): CorrelationEntry[] {
  const buckets = new Map<string, SignalData[]>();
  for (const s of signals) {
    if (!buckets.has(s.symbol)) buckets.set(s.symbol, []);
    buckets.get(s.symbol)!.push(s);
  }

  return [...buckets.entries()]
    .filter(([, sigs]) => sigs.length >= 3)
    .map(([symbol, sigs]) => ({
      label: symbol,
      winRate: Math.round((sigs.filter(s => s.outcome === "win").length / sigs.length) * 1000) / 10,
      trades: sigs.length,
      avgPnl: Math.round(sigs.reduce((s, sig) => s + (sig.pnl || 0), 0) / sigs.length * 100) / 100,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}

export function analyzeHoldTime(signals: SignalData[]): CorrelationEntry[] {
  const buckets: Record<string, SignalData[]> = {
    "<1h": [], "1-4h": [], "4-24h": [], "1-3d": [], ">3d": [],
  };

  for (const s of signals) {
    const h = s.hold_time_hours;
    if (h == null) continue;
    if (h < 1) buckets["<1h"].push(s);
    else if (h < 4) buckets["1-4h"].push(s);
    else if (h < 24) buckets["4-24h"].push(s);
    else if (h < 72) buckets["1-3d"].push(s);
    else buckets[">3d"].push(s);
  }

  return Object.entries(buckets)
    .filter(([, sigs]) => sigs.length >= 3)
    .map(([label, sigs]) => ({
      label,
      winRate: Math.round((sigs.filter(s => s.outcome === "win").length / sigs.length) * 1000) / 10,
      trades: sigs.length,
      avgPnl: Math.round(sigs.reduce((s, sig) => s + (sig.pnl || 0), 0) / sigs.length * 100) / 100,
    }));
}

export function generateWeeklyReport(signals: SignalData[]): string {
  if (signals.length < 3) return "No hay suficientes señales resueltas esta semana para generar un reporte.";

  const wins = signals.filter(s => s.outcome === "win").length;
  const losses = signals.filter(s => s.outcome === "loss").length;
  const totalPnl = signals.reduce((s, sig) => s + (sig.pnl || 0), 0);
  const winRate = Math.round((wins / signals.length) * 100);

  let report = `**Reporte Semanal de Trading**\n\n`;
  report += `**Resumen:** ${signals.length} trades · ${winRate}% WR · P&L: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}\n`;
  report += `Wins: ${wins} · Losses: ${losses} · Expired: ${signals.length - wins - losses}\n\n`;

  const byHour = analyzeByHour(signals);
  if (byHour.length > 0) {
    report += `**Mejor hora:** ${byHour[0].label} (${byHour[0].winRate}% WR, ${byHour[0].trades} trades)\n`;
    if (byHour.length > 1) {
      const worst = byHour[byHour.length - 1];
      report += `**Peor hora:** ${worst.label} (${worst.winRate}% WR, ${worst.trades} trades)\n`;
    }
  }

  const byDay = analyzeByDayOfWeek(signals);
  if (byDay.length > 0) {
    report += `**Mejor día:** ${byDay[0].label} (${byDay[0].winRate}% WR)\n`;
    const worst = byDay[byDay.length - 1];
    if (worst.winRate < 45) report += `**Evitar:** ${worst.label} (${worst.winRate}% WR)\n`;
  }

  const bySetup = analyzeBySetup(signals);
  if (bySetup.length > 0) {
    report += `\n**Mejor setup:** ${bySetup[0].label} (${bySetup[0].winRate}% WR, PF: ${bySetup[0].profitFactor})\n`;
  }

  const byHold = analyzeHoldTime(signals);
  if (byHold.length > 0) {
    const best = byHold.sort((a, b) => b.winRate - a.winRate)[0];
    report += `**Mejor hold time:** ${best.label} (${best.winRate}% WR)\n`;
  }

  return report;
}
