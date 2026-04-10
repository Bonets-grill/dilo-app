/**
 * IG Markets Client for Next.js — calls Python engine forex endpoints.
 * Does NOT call IG directly — all goes through Python engine for risk validation.
 * NEW FILE — does not modify any existing code.
 */

const ENGINE_URL = process.env.TRADING_ENGINE_URL || "http://localhost:8000";
const ENGINE_KEY = process.env.TRADING_ENGINE_KEY || "dev-secret";

async function forexFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ENGINE_URL}/forex${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ENGINE_KEY,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Forex API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Check if IG forex connection is working */
export async function isForexAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/forex/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

/** SMC analysis on a forex/gold pair */
export async function analyzeForex(instrument: string, resolution = "HOUR", count = 200) {
  return forexFetch("/analyze", {
    method: "POST",
    body: JSON.stringify({ instrument, resolution, count }),
  });
}

/** Multi-timeframe analysis (Weekly + Daily + H1) */
export async function analyzeForexMTF(instrument: string) {
  return forexFetch(`/analyze-mtf?instrument=${encodeURIComponent(instrument)}`, {
    method: "POST",
  });
}

// IG epic map — resolved from /forex/instruments, cached in memory
const EPIC_MAP: Record<string, string> = {
  "EUR/USD": "CS.D.EURUSD.TODAY.IP",
  "GBP/USD": "CS.D.GBPUSD.TODAY.IP",
  "USD/JPY": "CS.D.USDJPY.TODAY.IP",
  "GBP/JPY": "CS.D.GBPJPY.TODAY.IP",
  "EUR/GBP": "CS.D.EURGBP.TODAY.IP",
  "EUR/JPY": "CS.D.EURJPY.TODAY.IP",
  "AUD/USD": "CS.D.AUDUSD.TODAY.IP",
  "USD/CHF": "CS.D.USDCHF.TODAY.IP",
  "XAU/USD": "CS.D.USCGC.TODAY.IP",
  "GOLD": "CS.D.USCGC.TODAY.IP",
};

/** Get real-time bid/ask price */
export async function getForexQuote(instrument: string) {
  const epic = EPIC_MAP[instrument] || instrument;
  return forexFetch(`/quote/${encodeURIComponent(epic)}`);
}

/** Get IG account balance and equity */
export async function getForexAccount() {
  return forexFetch("/account");
}

/** Get open forex positions */
export async function getForexPositions() {
  return forexFetch("/positions");
}

/** Search for forex/gold markets */
export async function searchForexMarkets(query: string) {
  return forexFetch(`/markets?query=${encodeURIComponent(query)}`);
}

/** List all supported instruments */
export async function listForexInstruments() {
  return forexFetch("/instruments");
}

/** Place forex order with mandatory SL and TP */
export async function placeForexOrder(
  instrument: string,
  direction: string,
  size: number,
  stopLoss: number,
  takeProfit: number,
  accountSize = 20000,
  riskPct = 0.5,
) {
  return forexFetch("/order", {
    method: "POST",
    body: JSON.stringify({
      instrument,
      direction,
      size,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      account_size: accountSize,
      risk_pct: riskPct,
    }),
  });
}

/** Format IG instrument name for display */
export function formatInstrument(instrument: string): string {
  const map: Record<string, string> = {
    "EUR/USD": "Euro / Dólar",
    "GBP/USD": "Libra / Dólar",
    "USD/JPY": "Dólar / Yen",
    "GBP/JPY": "Libra / Yen",
    "EUR/GBP": "Euro / Libra",
    "EUR/JPY": "Euro / Yen",
    "XAU/USD": "Oro (XAU/USD)",
    "GOLD": "Oro (XAU/USD)",
    "SPX500": "S&P 500",
    "NAS100": "NASDAQ 100",
    "DAX": "DAX 40",
  };
  return map[instrument.toUpperCase()] || instrument;
}
