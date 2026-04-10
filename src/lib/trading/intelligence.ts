/**
 * DILO Trading Intelligence — Market regime detection, sentiment scoring,
 * multi-timeframe analysis, and symbol profile enrichment.
 *
 * NEW FILE — does not modify any existing code.
 */

import { createClient } from "@supabase/supabase-js";
import { getQuote, getBasicFinancials, getNewsSentiment, getCompanyNews, getRecommendations } from "@/lib/finnhub/client";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── REGIME DETECTION ──

export type MarketRegime = "trending_low_vol" | "trending_high_vol" | "ranging_low_vol" | "ranging_high_vol";

export interface RegimeAnalysis {
  regime: MarketRegime;
  description: string;
  recommendation: string;
  volatility_percentile: number; // 0-100
  trend_strength: number; // 0-100
}

/**
 * Detect current market regime using SPY as proxy.
 * Uses Finnhub quote data to estimate volatility and trend.
 */
export async function detectRegime(): Promise<RegimeAnalysis> {
  const quote = await getQuote("SPY").catch(() => null);
  const financials = await getBasicFinancials("SPY").catch(() => null);

  const dayRange = quote ? ((quote.h - quote.l) / quote.pc * 100) : 1;
  const dayChange = quote?.dp || 0;
  const beta = financials?.metric?.beta || 1;

  // Simple regime classification
  const isHighVol = dayRange > 1.5; // >1.5% daily range = high volatility
  const isTrending = Math.abs(dayChange) > 0.5; // >0.5% move = trending

  let regime: MarketRegime;
  let description: string;
  let recommendation: string;

  if (isTrending && isHighVol) {
    regime = "trending_high_vol";
    description = "Mercado en tendencia con alta volatilidad";
    recommendation = "Reducir tamaño de posición. Stops más amplios. Solo operar a favor de la tendencia.";
  } else if (isTrending && !isHighVol) {
    regime = "trending_low_vol";
    description = "Mercado en tendencia tranquila";
    recommendation = "Mejor entorno para trading. Seguir la tendencia. Stops normales.";
  } else if (!isTrending && isHighVol) {
    regime = "ranging_high_vol";
    description = "Mercado sin dirección con alta volatilidad";
    recommendation = "PELIGRO — peor régimen para trading. Reducir exposición o no operar.";
  } else {
    regime = "ranging_low_vol";
    description = "Mercado lateral y tranquilo";
    recommendation = "Buscar mean reversion. Operar en rangos. Tamaño normal.";
  }

  return {
    regime,
    description,
    recommendation,
    volatility_percentile: Math.min(100, dayRange * 40),
    trend_strength: Math.min(100, Math.abs(dayChange) * 50),
  };
}

// ── SENTIMENT SCORING ──

export interface SentimentScore {
  symbol: string;
  score: number; // -5 to +5
  confidence: number; // 0-100
  headlines_analyzed: number;
  key_theme: string;
}

/**
 * Score sentiment for a symbol using Finnhub news + GPT-4o-mini.
 * Batches headlines for cost efficiency (~$0.0002 per call).
 */
export async function scoreSentiment(symbol: string): Promise<SentimentScore> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const from = weekAgo.toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  const [news, finnhubSentiment] = await Promise.all([
    getCompanyNews(symbol, from, to).catch(() => []),
    getNewsSentiment(symbol).catch(() => null),
  ]);

  // Use Finnhub's built-in sentiment as base
  const bullish = finnhubSentiment?.sentiment?.bullishPercent || 0.5;
  const finnhubScore = (bullish - 0.5) * 10; // Convert to -5 to +5

  if (!news || news.length === 0) {
    return {
      symbol,
      score: Math.round(finnhubScore * 10) / 10,
      confidence: 30,
      headlines_analyzed: 0,
      key_theme: "Sin noticias recientes",
    };
  }

  // Batch headlines for GPT analysis (max 15 for cost)
  const headlines = news.slice(0, 15).map(n => n.headline).join("\n");

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 100,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Score the sentiment of these ${symbol} headlines from -5 (very bearish) to +5 (very bullish). Reply ONLY with JSON: {"score": X, "theme": "one line summary"}\n\n${headlines}`,
      }],
    });

    const text = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, ""));

    return {
      symbol,
      score: Math.max(-5, Math.min(5, parsed.score || 0)),
      confidence: Math.min(90, news.length * 6),
      headlines_analyzed: Math.min(15, news.length),
      key_theme: parsed.theme || "N/A",
    };
  } catch {
    return {
      symbol,
      score: Math.round(finnhubScore * 10) / 10,
      confidence: 30,
      headlines_analyzed: news.length,
      key_theme: "Análisis automático Finnhub",
    };
  }
}

// ── SYMBOL PROFILE ──

export interface SymbolProfile {
  symbol: string;
  avg_earnings_move_pct: number | null;
  best_months: number[];
  worst_months: number[];
  seasonality_notes: string;
  smc_win_rate: number | null;
  smc_best_setup: string | null;
  total_signals_analyzed: number;
  correlation_spy: number | null;
  sector: string;
  notes: string;
}

/**
 * Get the intelligence profile for a symbol.
 */
export async function getSymbolProfile(symbol: string): Promise<SymbolProfile | null> {
  const { data } = await supabase
    .from("symbol_profiles")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();

  return data as SymbolProfile | null;
}

// ── ENHANCED SIGNAL CONTEXT ──

/**
 * Build enriched context string for a symbol's analysis.
 * This gets injected into signal generation for smarter decisions.
 */
export async function buildSignalContext(symbol: string): Promise<string> {
  const [profile, regime, sentiment] = await Promise.all([
    getSymbolProfile(symbol).catch(() => null),
    detectRegime().catch(() => null),
    scoreSentiment(symbol).catch(() => null),
  ]);

  const parts: string[] = [];

  // Regime context
  if (regime) {
    parts.push(`RÉGIMEN ACTUAL: ${regime.description}. ${regime.recommendation}`);
  }

  // Sentiment
  if (sentiment) {
    const sentimentLabel = sentiment.score > 2 ? "MUY ALCISTA" : sentiment.score > 0.5 ? "ALCISTA" : sentiment.score < -2 ? "MUY BAJISTA" : sentiment.score < -0.5 ? "BAJISTA" : "NEUTRAL";
    parts.push(`SENTIMIENTO ${symbol}: ${sentimentLabel} (${sentiment.score}/5, ${sentiment.headlines_analyzed} noticias). ${sentiment.key_theme}`);
  }

  // Symbol profile
  if (profile) {
    const currentMonth = new Date().getMonth() + 1;
    const isBestMonth = profile.best_months?.includes(currentMonth);
    const isWorstMonth = profile.worst_months?.includes(currentMonth);

    if (profile.seasonality_notes) {
      parts.push(`ESTACIONALIDAD: ${profile.seasonality_notes}${isBestMonth ? " → ESTAMOS EN MES FAVORABLE" : ""}${isWorstMonth ? " → ⚠️ ESTAMOS EN MES DESFAVORABLE" : ""}`);
    }

    if (profile.avg_earnings_move_pct) {
      parts.push(`EARNINGS: Movimiento promedio de ${profile.avg_earnings_move_pct}% en día de earnings`);
    }

    if (profile.smc_win_rate && profile.total_signals_analyzed > 10) {
      parts.push(`HISTORIAL DILO: ${profile.smc_win_rate}% win rate en ${profile.total_signals_analyzed} señales SMC. Mejor setup: ${profile.smc_best_setup}`);
    }

    if (profile.notes) {
      parts.push(`INTEL: ${profile.notes}`);
    }
  }

  return parts.length > 0 ? parts.join("\n") : "";
}
