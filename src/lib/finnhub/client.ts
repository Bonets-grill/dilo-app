/**
 * Finnhub API Client — professional market data
 * Free tier: 60 calls/minute
 */

const BASE = "https://finnhub.io/api/v1";
const KEY = () => process.env.FINNHUB_API_KEY || "";

async function fhFetch(path: string) {
  const res = await fetch(`${BASE}${path}&token=${KEY()}`);
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Analyst Recommendations ──
export interface Recommendation {
  symbol: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
}

export async function getRecommendations(symbol: string): Promise<Recommendation[]> {
  return fhFetch(`/stock/recommendation?symbol=${symbol}`);
}

// ── Price Target ──
export interface PriceTarget {
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
  lastUpdated: string;
}

export async function getPriceTarget(symbol: string): Promise<PriceTarget> {
  return fhFetch(`/stock/price-target?symbol=${symbol}`);
}

// ── Company Profile ──
export interface CompanyProfile {
  name: string;
  ticker: string;
  exchange: string;
  finnhubIndustry: string;
  marketCapitalization: number;
  ipo: string;
  weburl: string;
  logo: string;
}

export async function getCompanyProfile(symbol: string): Promise<CompanyProfile> {
  return fhFetch(`/stock/profile2?symbol=${symbol}`);
}

// ── Quote (current price) ──
export interface Quote {
  c: number;  // current
  d: number;  // change
  dp: number; // change percent
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // previous close
  t: number;  // timestamp
}

export async function getQuote(symbol: string): Promise<Quote> {
  return fhFetch(`/quote?symbol=${symbol}`);
}

// ── Earnings Calendar ──
export interface EarningsEvent {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
}

export async function getEarningsCalendar(from: string, to: string): Promise<{ earningsCalendar: EarningsEvent[] }> {
  return fhFetch(`/calendar/earnings?from=${from}&to=${to}`);
}

// ── Market News ──
export interface MarketNews {
  category: string;
  headline: string;
  source: string;
  summary: string;
  url: string;
  datetime: number;
  related: string;
}

export async function getMarketNews(category = "general"): Promise<MarketNews[]> {
  return fhFetch(`/news?category=${category}`);
}

export async function getCompanyNews(symbol: string, from: string, to: string): Promise<MarketNews[]> {
  return fhFetch(`/company-news?symbol=${symbol}&from=${from}&to=${to}`);
}

// ── News Sentiment ──
export interface NewsSentiment {
  buzz: { articlesInLastWeek: number; buzz: number; weeklyAverage: number };
  companyNewsScore: number;
  sectorAverageBullishPercent: number;
  sectorAverageNewsScore: number;
  sentiment: { bearishPercent: number; bullishPercent: number };
  symbol: string;
}

export async function getNewsSentiment(symbol: string): Promise<NewsSentiment> {
  return fhFetch(`/news-sentiment?symbol=${symbol}`);
}

// ── Peers ──
export async function getPeers(symbol: string): Promise<string[]> {
  return fhFetch(`/stock/peers?symbol=${symbol}`);
}

// ── Basic Financials (metrics) ──
export interface BasicFinancials {
  metric: {
    "52WeekHigh"?: number;
    "52WeekLow"?: number;
    "10DayAverageTradingVolume"?: number;
    beta?: number;
    peBasicExclExtraTTM?: number;
    dividendYieldIndicatedAnnual?: number;
    epsBasicExclExtraItemsTTM?: number;
    marketCapitalization?: number;
    revenuePerShareTTM?: number;
    roeTTM?: number;
    [key: string]: number | undefined;
  };
}

export async function getBasicFinancials(symbol: string): Promise<BasicFinancials> {
  return fhFetch(`/stock/metric?symbol=${symbol}&metric=all`);
}
