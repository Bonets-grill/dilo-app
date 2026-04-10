/**
 * ExchangeRate-API client — Free tier: 1,500 calls/month
 * No API key needed for open access endpoint
 */

export interface CurrencyConversion {
  from: string;
  to: string;
  amount: number;
  result: number;
  rate: number;
  lastUpdate: string;
}

/**
 * Convert currency using ExchangeRate-API (free, no key)
 */
export async function convertCurrency(amount: number, from: string, to: string): Promise<CurrencyConversion | null> {
  try {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    const res = await fetch(
      `https://open.er-api.com/v6/latest/${fromCode}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return null;
    const data = await res.json();

    if (data.result !== "success") return null;

    const rate = data.rates?.[toCode];
    if (!rate) return null;

    return {
      from: fromCode,
      to: toCode,
      amount,
      result: Math.round(amount * rate * 100) / 100,
      rate: Math.round(rate * 10000) / 10000,
      lastUpdate: data.time_last_update_utc || "",
    };
  } catch {
    return null;
  }
}

/**
 * Get all exchange rates for a base currency
 */
export async function getRates(base: string = "EUR"): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${base.toUpperCase()}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.rates || null;
  } catch {
    return null;
  }
}
