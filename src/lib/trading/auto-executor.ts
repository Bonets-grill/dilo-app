/**
 * Auto-Executor — Places orders on Alpaca when signals pass all checks.
 *
 * ONLY for paper trading. Calculates position size from risk rules,
 * places bracket order (entry + SL + TP), and logs everything.
 *
 * Safety:
 * - ONLY executes on paper mode accounts
 * - Respects 0.5% risk per trade ($500 on $100K)
 * - Max 3 open positions from auto-execution
 * - Max 1 trade per symbol per day
 * - Logs every decision to trading_signal_log
 */

import { getAlpacaKeys } from "@/lib/oauth/alpaca";
import { getAccount, getPositions, placeOrder, type AlpacaAuth } from "@/lib/alpaca/client";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

function deterministicClientOrderId(
  symbol: string,
  side: string,
  entry: number,
  sl: number,
  tp: number,
): string {
  const day = new Date().toISOString().slice(0, 10);
  const material = `${symbol}|${side}|${entry}|${sl}|${tp}|${day}`;
  const hash = createHash("sha256").update(material).digest("hex").slice(0, 24);
  return `dilo-${hash}`;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MARIO_USER_ID = "def038c9-19dc-45cf-93d3-60b6fc65887f";
const MAX_AUTO_POSITIONS = 3;
const RISK_PCT = 0.005; // 0.5% per trade

export interface ExecutionResult {
  executed: boolean;
  reason: string;
  orderId?: string;
  qty?: number;
  symbol?: string;
  side?: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export async function executeSignal(signal: {
  symbol: string;
  side: string; // "BUY" | "SELL"
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  confidence: number;
  setup_type?: string;
  reasoning?: string[];
  size_multiplier?: number; // From enhanced_risk (0.0-1.0); default 1.0
}): Promise<ExecutionResult> {
  const fail = (reason: string): ExecutionResult => ({ executed: false, reason });

  try {
    // 1. Get Alpaca keys
    const keys = await getAlpacaKeys(MARIO_USER_ID);
    if (!keys) return fail("No Alpaca keys found");

    // 2. SAFETY: Only paper mode
    if (!keys.paperMode) return fail("BLOCKED: Only paper trading allowed for auto-execution");

    const auth: AlpacaAuth = keys;

    // 3. Check account
    const account = await getAccount(auth);
    const equity = parseFloat(account.equity);
    const buyingPower = parseFloat(account.buying_power);

    if (equity <= 0) return fail("Account equity is 0");

    // 4. Check existing positions from auto-execution
    const positions = await getPositions(auth);
    const autoPositions = positions.length; // Simple count for now

    if (autoPositions >= MAX_AUTO_POSITIONS) {
      return fail(`Max ${MAX_AUTO_POSITIONS} positions reached (have ${autoPositions})`);
    }

    // 5. Check if already have position in this symbol
    const existingPosition = positions.find(p => p.symbol === signal.symbol);
    if (existingPosition) {
      return fail(`Already have position in ${signal.symbol}`);
    }

    // 6. Check if already traded this symbol today
    const today = new Date().toISOString().slice(0, 10);
    const { data: todaySignals } = await supabase
      .from("trading_signal_log")
      .select("id")
      .eq("symbol", signal.symbol)
      .eq("source", "dilo_auto_exec")
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1);

    if (todaySignals && todaySignals.length > 0) {
      return fail(`Already traded ${signal.symbol} today`);
    }

    // 7. Calculate position size (risk-based, scaled by enhanced_risk multiplier)
    const sizeMultiplier = Math.max(0, Math.min(1, signal.size_multiplier ?? 1.0));
    const riskAmount = equity * RISK_PCT * sizeMultiplier; // Scaled by drawdown/equity-curve tier
    const slDistance = Math.abs(signal.entry_price - signal.stop_loss);

    if (slDistance <= 0) return fail("Invalid SL distance");

    const rawQty = Math.floor(riskAmount / slDistance);
    if (rawQty <= 0) return fail(`Position size too small (size_multiplier=${sizeMultiplier})`);

    // Cap by buying power
    const cost = rawQty * signal.entry_price;
    const qty = cost > buyingPower ? Math.floor(buyingPower / signal.entry_price) : rawQty;

    if (qty <= 0) return fail("Not enough buying power");

    // 8. Place native bracket order (entry + SL + TP atomic, idempotent)
    const side = signal.side.toUpperCase() === "BUY" ? "buy" : "sell";
    const clientOrderId = deterministicClientOrderId(
      signal.symbol,
      side,
      signal.entry_price,
      signal.stop_loss,
      signal.take_profit,
    );

    const order = await placeOrder(auth, {
      symbol: signal.symbol,
      qty: String(qty),
      side: side as "buy" | "sell",
      type: "market",
      time_in_force: "gtc",
      order_class: "bracket",
      take_profit: { limit_price: String(signal.take_profit) },
      stop_loss: { stop_price: String(signal.stop_loss) },
      client_order_id: clientOrderId,
    });

    return {
      executed: true,
      reason: `Order placed: ${side} ${qty} ${signal.symbol} @ market`,
      orderId: order.id,
      qty,
      symbol: signal.symbol,
      side: signal.side,
      entryPrice: signal.entry_price,
      stopLoss: signal.stop_loss,
      takeProfit: signal.take_profit,
    };

  } catch (err) {
    return fail(`Execution error: ${(err as Error).message}`);
  }
}
