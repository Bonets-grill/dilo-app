/**
 * Trading Metrics — Professional signal analytics
 *
 * MFE: Maximum Favorable Excursion — best price the trade reached
 * MAE: Maximum Adverse Excursion — worst price the trade reached
 * R-Multiple: P&L in units of risk (how much you made per unit risked)
 * Hold Time: Duration from signal creation to resolution
 */

/**
 * Calculate R-Multiple: P&L divided by risk per share
 * R = 1.0 means you made exactly what you risked
 * R = 2.0 means you made 2x what you risked
 * R = -1.0 means you lost exactly what you risked (hit SL)
 */
export function calculateRMultiple(
  pnl: number,
  entryPrice: number,
  stopLoss: number,
  side: string,
): number {
  const riskPerShare = side === "BUY"
    ? Math.abs(entryPrice - stopLoss)
    : Math.abs(stopLoss - entryPrice);

  if (riskPerShare === 0) return 0;
  return Math.round((pnl / riskPerShare) * 100) / 100;
}

/**
 * Calculate MFE from current/exit price vs entry
 * For BUY: highest price reached above entry
 * For SELL: lowest price reached below entry
 */
export function calculateMFE(
  entryPrice: number,
  highPrice: number,
  lowPrice: number,
  side: string,
): number {
  if (side === "BUY") {
    return Math.max(0, highPrice - entryPrice);
  }
  return Math.max(0, entryPrice - lowPrice);
}

/**
 * Calculate MAE from current/exit price vs entry
 * For BUY: lowest price reached below entry (drawdown)
 * For SELL: highest price reached above entry (drawdown)
 */
export function calculateMAE(
  entryPrice: number,
  highPrice: number,
  lowPrice: number,
  side: string,
): number {
  if (side === "BUY") {
    return Math.max(0, entryPrice - lowPrice);
  }
  return Math.max(0, highPrice - entryPrice);
}

/**
 * Calculate hold time in hours between two timestamps
 */
export function calculateHoldTime(
  createdAt: string,
  resolvedAt: string,
): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(resolvedAt).getTime();
  return Math.round((end - start) / 3600000 * 10) / 10; // 1 decimal
}

/**
 * Enrich a signal with all professional metrics when resolving it
 */
export function enrichSignalMetrics(signal: {
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  side: string;
  created_at: string;
  pnl: number;
}, currentPrice: number, highPrice: number, lowPrice: number): {
  mfe: number;
  mae: number;
  r_multiple: number;
  hold_time_hours: number;
  entry_hour_utc: number;
  entry_day_of_week: number;
} {
  const now = new Date().toISOString();
  const entryDate = new Date(signal.created_at);

  return {
    mfe: calculateMFE(signal.entry_price, highPrice, lowPrice, signal.side),
    mae: calculateMAE(signal.entry_price, highPrice, lowPrice, signal.side),
    r_multiple: calculateRMultiple(signal.pnl, signal.entry_price, signal.stop_loss, signal.side),
    hold_time_hours: calculateHoldTime(signal.created_at, now),
    entry_hour_utc: entryDate.getUTCHours(),
    entry_day_of_week: entryDate.getUTCDay(),
  };
}
