/**
 * Finnhub Insider Transactions — separate from main client to avoid
 * modifying locked file (finnhub/client.ts)
 */

const BASE = "https://finnhub.io/api/v1";
const KEY = () => process.env.FINNHUB_API_KEY || "";

export interface InsiderTransaction {
  name: string;
  share: number;
  change: number;
  transactionDate: string;
  transactionCode: string; // P = Purchase, S = Sale
  transactionPrice: number;
}

/**
 * Get insider transactions for a symbol (last 90 days)
 */
export async function getInsiderTransactions(symbol: string): Promise<InsiderTransaction[]> {
  const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${BASE}/stock/insider-transactions?symbol=${symbol}&from=${from}&to=${to}&token=${KEY()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.data || [];
}

/**
 * Analyze insider activity for a symbol.
 * Returns: buys count, sells count, and a flag.
 */
export async function analyzeInsiderActivity(symbol: string): Promise<{
  buys: number;
  sells: number;
  flag: "insider_bullish" | "insider_bearish" | "neutral";
}> {
  const txns = await getInsiderTransactions(symbol);

  const buys = txns.filter(t => t.transactionCode === "P").length;
  const sells = txns.filter(t => t.transactionCode === "S").length;

  const flag = buys >= 3 ? "insider_bullish" : sells >= 5 ? "insider_bearish" : "neutral";

  return { buys, sells, flag };
}
