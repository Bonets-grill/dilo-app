/**
 * DILO Trading Intelligence — Market regime detection, sentiment scoring,
 * insider analysis, and symbol profile enrichment.
 *
 * All functions are FILTERS that adjust signal confidence.
 * Each filter is tagged in filters_applied[] for measurement.
 */

import { createClient } from "@supabase/supabase-js";
import { getQuote, getNewsSentiment } from "@/lib/finnhub/client";
import { analyzeInsiderActivity } from "@/lib/finnhub/insider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── TYPES ──

export type MarketRegime = "trending_low_vol" | "trending_high_vol" | "ranging_low_vol" | "ranging_high_vol";

export interface RegimeAnalysis {
  regime: MarketRegime;
  description: string;
  recommendation: string;
}

export interface SignalFilters {
  confidenceAdjustment: number;
  filtersApplied: string[];
  context: string[];
  blocked: boolean;
  blockReason?: string;
}

// ── REGIME DETECTION (uses 5-day rolling, not single day) ──

export async function detectRegime(): Promise<RegimeAnalysis> {
  // Get last 5 trading days of SPY data from trading_knowledge
  const fiveDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const { data: recentScans } = await supabase
    .from("trading_knowledge")
    .select("data")
    .eq("symbol", "SPY")
    .eq("category", "market_scan")
    .gte("date", fiveDaysAgo)
    .order("date", { ascending: false })
    .limit(5);

  if (!recentScans || recentScans.length === 0) {
    // Fallback to single-day quote if no history
    const quote = await getQuote("SPY").catch(() => null);
    const dayRange = quote ? ((quote.h - quote.l) / quote.pc * 100) : 1;
    const dayChange = Math.abs(quote?.dp || 0);
    return classifyRegime(dayRange, dayChange);
  }

  // Calculate 5-day average range and average absolute change
  let totalRange = 0;
  let totalAbsChange = 0;
  let count = 0;

  for (const scan of recentScans) {
    const d = scan.data as Record<string, number>;
    if (d.high && d.low && d.price) {
      totalRange += ((d.high - d.low) / d.price) * 100;
      totalAbsChange += Math.abs(d.change_pct || 0);
      count++;
    }
  }

  const avgRange = count > 0 ? totalRange / count : 1;
  const avgAbsChange = count > 0 ? totalAbsChange / count : 0.5;

  return classifyRegime(avgRange, avgAbsChange);
}

function classifyRegime(avgRange: number, avgAbsChange: number): RegimeAnalysis {
  const isHighVol = avgRange > 1.5;
  const isTrending = avgAbsChange > 0.5;

  if (isTrending && isHighVol) {
    return {
      regime: "trending_high_vol",
      description: "Mercado en tendencia con alta volatilidad (5 días)",
      recommendation: "Reducir tamaño. Stops amplios. Solo a favor de tendencia.",
    };
  }
  if (isTrending && !isHighVol) {
    return {
      regime: "trending_low_vol",
      description: "Mercado en tendencia tranquila (5 días)",
      recommendation: "Mejor entorno. Seguir tendencia. Stops normales.",
    };
  }
  if (!isTrending && isHighVol) {
    return {
      regime: "ranging_high_vol",
      description: "Sin dirección con alta volatilidad (5 días)",
      recommendation: "PELIGRO. Reducir exposición o no operar.",
    };
  }
  return {
    regime: "ranging_low_vol",
    description: "Mercado lateral y tranquilo (5 días)",
    recommendation: "Mean reversion. Operar en rangos.",
  };
}

// ── APPLY ALL FILTERS TO A SIGNAL ──

/**
 * Apply all intelligence filters to a potential signal.
 * Returns confidence adjustment + list of filters applied.
 *
 * ALL WEIGHTS START AT +5/-5 (equal).
 * After 30 days, real data from filters_applied determines which
 * weights to increase/decrease. No invented numbers.
 *
 * Temporal note: Signals resolve at 24h.
 *   - Sentiment: predicts 30min (VERY weak at 24h)
 *   - Insider: predicts 1-6 months (background bias only at 24h)
 *   - Regime: market context, not directional prediction
 *   - Seasonality: monthly bias, weak at daily level
 * All filters are SOFT — adjust confidence, never hard block.
 * Data will tell us in 30 days which ones actually help.
 */
export async function applySignalFilters(
  symbol: string,
  side: "BUY" | "SELL",
  baseConfidence: number,
): Promise<SignalFilters> {
  const W = 5; // Uniform weight — data will refine this after 30 days
  let adjustment = 0;
  const filters: string[] = [];
  const context: string[] = [];

  // ── FILTER 1: Sentiment (Finnhub only, NO GPT) ──
  // Temporal match: WEAK (predicts 30min, signals resolve 24h)
  // Kept for data collection — may be removed after 30 days
  try {
    const sentiment = await getNewsSentiment(symbol);
    const bullish = sentiment?.sentiment?.bullishPercent || 0.5;

    if (side === "BUY" && bullish < 0.3) {
      adjustment -= W;
      filters.push("sentiment_against");
      context.push(`Sentiment ${(bullish * 100).toFixed(0)}% bullish contra BUY`);
    } else if (side === "SELL" && bullish > 0.7) {
      adjustment -= W;
      filters.push("sentiment_against");
      context.push(`Sentiment ${(bullish * 100).toFixed(0)}% bullish contra SELL`);
    } else if ((side === "BUY" && bullish > 0.6) || (side === "SELL" && bullish < 0.4)) {
      adjustment += W;
      filters.push("sentiment_aligned");
      context.push(`Sentiment alineado con ${side}`);
    }
  } catch { /* skip */ }

  // ── FILTER 2: Insider Transactions ──
  // Temporal match: WEAK for 24h (predicts 1-6 months)
  // But strongest academic evidence — keep as background bias
  try {
    const insider = await analyzeInsiderActivity(symbol);
    if (insider.flag !== "neutral") {
      const aligned = (insider.flag === "insider_bullish" && side === "BUY") ||
                       (insider.flag === "insider_bearish" && side === "SELL");
      adjustment += aligned ? W : -W;
      filters.push(aligned ? "insider_aligned" : "insider_against");
      context.push(`Insider: ${insider.buys} buys, ${insider.sells} sells (90d) → ${insider.flag}`);
    }
  } catch { /* skip */ }

  // ── FILTER 3: Regime (informational context + adjustment) ──
  try {
    const regime = await detectRegime();
    context.push(`Régimen: ${regime.description}`);

    if (regime.regime === "ranging_high_vol") {
      adjustment -= W;
      filters.push("regime_dangerous");
    } else if (regime.regime === "trending_low_vol") {
      adjustment += W;
      filters.push("regime_favorable");
    }
  } catch { /* skip */ }

  // ── FILTER 4: Seasonality from symbol_profiles ──
  try {
    const { data: profile } = await supabase
      .from("symbol_profiles")
      .select("best_months, worst_months, seasonality_notes, smc_win_rate, smc_best_setup, total_signals_analyzed, notes")
      .eq("symbol", symbol)
      .maybeSingle();

    if (profile) {
      const currentMonth = new Date().getMonth() + 1;
      if (profile.worst_months?.includes(currentMonth)) {
        adjustment -= W;
        filters.push("seasonality_unfavorable");
        context.push(`Mes desfavorable para ${symbol}`);
      } else if (profile.best_months?.includes(currentMonth)) {
        adjustment += W;
        filters.push("seasonality_favorable");
        context.push(`Mes favorable para ${symbol}`);
      }

      if (profile.smc_win_rate && profile.total_signals_analyzed > 10) {
        context.push(`Historial DILO: ${profile.smc_win_rate}% win rate en ${profile.total_signals_analyzed} señales`);
      }

      if (profile.notes) {
        context.push(`Intel: ${profile.notes}`);
      }
    }
  } catch { /* skip */ }

  return {
    confidenceAdjustment: adjustment,
    filtersApplied: filters,
    context,
    blocked: false, // Soft filters only — never hard block
    blockReason: undefined,
  };
}
