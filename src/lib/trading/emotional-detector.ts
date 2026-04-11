/**
 * Emotional Pattern Detection — Detects FOMO, revenge trading, tilt, overtrading
 *
 * Each detector returns a score 0-100 and an array of triggers explaining why.
 * Composite score is weighted: tilt 30%, fomo 25%, revenge 25%, overtrading 20%
 */

import type { BaselineMetrics } from "./baseline";

interface DetectionResult {
  score: number;
  triggers: string[];
}

interface TradeData {
  created_at: string;
  outcome: string | null;
  pnl: number | null;
  symbol: string;
  side: string;
  confidence: number | null;
}

/**
 * Detect FOMO — Chasing moves, rapid entries, symbol switching
 */
export function detectFOMO(
  tradesToday: TradeData[],
  baseline: BaselineMetrics,
): DetectionResult {
  let score = 0;
  const triggers: string[] = [];

  if (tradesToday.length < 2) return { score: 0, triggers: [] };

  // Check gap between trades (< 5 min = chasing)
  const gaps: number[] = [];
  for (let i = 1; i < tradesToday.length; i++) {
    const gap = (new Date(tradesToday[i].created_at).getTime() - new Date(tradesToday[i - 1].created_at).getTime()) / 60000;
    gaps.push(gap);
  }
  const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 999;

  if (avgGap < 5) {
    score += 40;
    triggers.push(`Entradas muy rápidas: ${avgGap.toFixed(0)}min entre trades (normal: ${baseline.avgGapMinutes}min)`);
  } else if (avgGap < baseline.avgGapMinutes * 0.3) {
    score += 25;
    triggers.push(`Frecuencia elevada: ${avgGap.toFixed(0)}min entre trades vs ${baseline.avgGapMinutes}min normal`);
  }

  // Symbol switching (>60% different symbols = chasing momentum)
  const uniqueSymbols = new Set(tradesToday.map(t => t.symbol));
  const switchRate = uniqueSymbols.size / tradesToday.length;
  if (switchRate > 0.6 && tradesToday.length >= 4) {
    score += 30;
    triggers.push(`Cambio frecuente de símbolo: ${uniqueSymbols.size} símbolos en ${tradesToday.length} trades`);
  }

  // Low confidence trades (< 50 = entering without conviction)
  const lowConfTrades = tradesToday.filter(t => (t.confidence || 50) < 45);
  if (lowConfTrades.length >= 2) {
    score += 20;
    triggers.push(`${lowConfTrades.length} trades con confianza baja (<45%)`);
  }

  return { score: Math.min(100, score), triggers };
}

/**
 * Detect Revenge Trading — Trading to recover losses
 */
export function detectRevenge(
  tradesToday: TradeData[],
  baseline: BaselineMetrics,
): DetectionResult {
  let score = 0;
  const triggers: string[] = [];

  if (tradesToday.length < 3) return { score: 0, triggers: [] };

  // Find loss streaks followed by rapid re-entry
  let lossStreak = 0;
  let tradesAfterLoss = 0;
  let timeAfterLastLoss = 0;

  for (let i = 0; i < tradesToday.length; i++) {
    const t = tradesToday[i];
    if (t.outcome === "loss") {
      lossStreak++;
      // Check if next trade is within 30 minutes
      if (i < tradesToday.length - 1) {
        const nextGap = (new Date(tradesToday[i + 1].created_at).getTime() - new Date(t.created_at).getTime()) / 60000;
        if (nextGap < 30) {
          tradesAfterLoss++;
          timeAfterLastLoss = nextGap;
        }
      }
    } else {
      lossStreak = 0;
    }
  }

  if (lossStreak >= 3) {
    score += 40;
    triggers.push(`${lossStreak} pérdidas consecutivas hoy`);
  }

  if (tradesAfterLoss >= 2) {
    score += 35;
    triggers.push(`${tradesAfterLoss} re-entradas rápidas después de pérdida (${timeAfterLastLoss.toFixed(0)}min)`);
  }

  // Win rate today vs baseline
  const resolvedToday = tradesToday.filter(t => t.outcome);
  if (resolvedToday.length >= 5) {
    const todayWR = (resolvedToday.filter(t => t.outcome === "win").length / resolvedToday.length) * 100;
    if (todayWR < baseline.winRate - 15) {
      score += 25;
      triggers.push(`Win rate hoy: ${todayWR.toFixed(0)}% vs normal ${baseline.winRate.toFixed(0)}%`);
    }
  }

  return { score: Math.min(100, score), triggers };
}

/**
 * Detect Tilt — Emotional breakdown leading to erratic trading
 */
export function detectTilt(
  tradesToday: TradeData[],
  baseline: BaselineMetrics,
): DetectionResult {
  let score = 0;
  const triggers: string[] = [];

  if (tradesToday.length < 3) return { score: 0, triggers: [] };

  // Frequency > 2x normal
  if (tradesToday.length > baseline.avgTradesPerDay * 2 && baseline.avgTradesPerDay > 0) {
    score += 30;
    triggers.push(`${tradesToday.length} trades hoy vs ${baseline.avgTradesPerDay} normal (${(tradesToday.length / baseline.avgTradesPerDay).toFixed(1)}x)`);
  }

  // Loss streak >= 4
  let maxLossStreak = 0;
  let currentStreak = 0;
  for (const t of tradesToday) {
    if (t.outcome === "loss") { currentStreak++; maxLossStreak = Math.max(maxLossStreak, currentStreak); }
    else { currentStreak = 0; }
  }
  if (maxLossStreak >= 4) {
    score += 35;
    triggers.push(`Racha de ${maxLossStreak} pérdidas consecutivas`);
  }

  // Daily P&L severely negative
  const totalPnl = tradesToday.reduce((s, t) => s + (t.pnl || 0), 0);
  if (totalPnl < -500) {
    score += 25;
    triggers.push(`P&L del día: $${totalPnl.toFixed(0)} — pérdida significativa`);
  }

  // Mixed signals: buying AND selling same symbol rapidly
  const symbolSides = new Map<string, Set<string>>();
  for (const t of tradesToday) {
    if (!symbolSides.has(t.symbol)) symbolSides.set(t.symbol, new Set());
    symbolSides.get(t.symbol)!.add(t.side);
  }
  const flippedSymbols = [...symbolSides.values()].filter(sides => sides.size > 1).length;
  if (flippedSymbols >= 2) {
    score += 20;
    triggers.push(`Cambió de dirección en ${flippedSymbols} símbolos (señal de indecisión)`);
  }

  return { score: Math.min(100, score), triggers };
}

/**
 * Detect Overtrading — Too many trades, portfolio churn
 */
export function detectOvertrading(
  tradesToday: TradeData[],
  baseline: BaselineMetrics,
): DetectionResult {
  let score = 0;
  const triggers: string[] = [];

  // Absolute limit: > 20 trades/day
  if (tradesToday.length > 20) {
    score += 50;
    triggers.push(`${tradesToday.length} trades hoy — excesivo`);
  } else if (tradesToday.length > 15) {
    score += 30;
    triggers.push(`${tradesToday.length} trades hoy — alto`);
  }

  // Relative to baseline: > 3x normal
  if (baseline.avgTradesPerDay > 0 && tradesToday.length > baseline.avgTradesPerDay * 3) {
    score += 30;
    triggers.push(`${(tradesToday.length / baseline.avgTradesPerDay).toFixed(1)}x más trades que tu media`);
  }

  // Clustering: >25% of trades in one hour
  const hourBuckets = new Map<number, number>();
  for (const t of tradesToday) {
    const hour = new Date(t.created_at).getUTCHours();
    hourBuckets.set(hour, (hourBuckets.get(hour) || 0) + 1);
  }
  const maxInHour = Math.max(...hourBuckets.values(), 0);
  if (tradesToday.length >= 8 && maxInHour / tradesToday.length > 0.25) {
    score += 20;
    triggers.push(`${maxInHour} trades en la misma hora — clustering`);
  }

  return { score: Math.min(100, score), triggers };
}

/**
 * Calculate composite emotional score
 * Weights: tilt 30%, fomo 25%, revenge 25%, overtrading 20%
 */
export function calculateCompositeScore(
  tilt: number,
  fomo: number,
  revenge: number,
  overtrading: number,
): number {
  return Math.round(tilt * 0.3 + fomo * 0.25 + revenge * 0.25 + overtrading * 0.2);
}

/**
 * Get emotional level from composite score
 */
export function getEmotionalLevel(composite: number): "OK" | "CAUTION" | "ALERT" | "STOP" {
  if (composite >= 70) return "STOP";
  if (composite >= 50) return "ALERT";
  if (composite >= 30) return "CAUTION";
  return "OK";
}
