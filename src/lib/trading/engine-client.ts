/**
 * DILO Trading Engine Client
 * Calls the Python microservice for professional SMC analysis.
 */

const ENGINE_URL = process.env.TRADING_ENGINE_URL || "http://localhost:8000";
const ENGINE_KEY = process.env.TRADING_ENGINE_KEY || "dev-secret";

async function engineFetch(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ENGINE_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trading Engine ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Full SMC analysis for a symbol.
 * Returns: order blocks, FVGs, sweeps, BOS, CHoCH, bias, signal.
 */
export async function analyzeSMC(
  symbol: string,
  timeframe = "1d",
  period = "3mo",
  accountSize = 20000,
  riskPct = 0.5,
  accountState?: {
    equity?: number;
    open_positions?: number;
    daily_pnl?: number;
    daily_trades?: number;
    peak_balance?: number;
    consecutive_losses?: number;
    session_closed?: boolean;
  },
) {
  return engineFetch("/analyze", {
    symbol, timeframe, period,
    account_size: accountSize,
    risk_pct: riskPct,
    ...(accountState || {}),
  });
}

/**
 * Check for liquidity sweeps on a symbol.
 */
export async function checkSweeps(symbol: string, timeframe = "1h", period = "1mo") {
  return engineFetch("/sweeps", { symbol, timeframe, period });
}

/**
 * Validate a signal through the hardcoded Risk Engine.
 */
export async function validateSignal(signal: Record<string, unknown>, account: Record<string, unknown>) {
  return engineFetch("/validate", { signal, account });
}

/**
 * Calculate position size for stocks.
 */
export async function positionSizeStocks(accountBalance: number, riskPct: number, entryPrice: number, slPrice: number) {
  const params = new URLSearchParams({
    account_balance: String(accountBalance),
    risk_pct: String(riskPct),
    entry_price: String(entryPrice),
    sl_price: String(slPrice),
  });
  const res = await fetch(`${ENGINE_URL}/position-size/stocks?${params}`, {
    method: "POST",
    headers: { "X-API-Key": ENGINE_KEY },
  });
  return res.json();
}

/**
 * Calculate lot size for Forex.
 */
export async function positionSizeForex(accountBalance: number, riskPct: number, slPips: number, pipValue = 10) {
  const params = new URLSearchParams({
    account_balance: String(accountBalance),
    risk_pct: String(riskPct),
    sl_pips: String(slPips),
    pip_value: String(pipValue),
  });
  const res = await fetch(`${ENGINE_URL}/position-size/forex?${params}`, {
    method: "POST",
    headers: { "X-API-Key": ENGINE_KEY },
  });
  return res.json();
}

/**
 * Check if the engine is available.
 */
export async function isEngineAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Format SMC analysis for chat display.
 */
export function formatSMCAnalysis(analysis: Record<string, unknown>): string {
  const symbol = analysis.symbol as string;
  const bias = analysis.bias as string;
  const sweeps = analysis.sweeps as Array<Record<string, unknown>> || [];
  const orderBlocks = analysis.order_blocks as Array<Record<string, unknown>> || [];
  const fvgs = analysis.fvgs as Array<Record<string, unknown>> || [];
  const bos = analysis.bos as Array<Record<string, unknown>> || [];
  const choch = analysis.choch as Array<Record<string, unknown>> || [];
  const signal = analysis.signal as Record<string, unknown> | null;
  const riskDecision = analysis.risk_decision as Record<string, unknown> | null;
  const posSizing = analysis.position_sizing as Record<string, unknown> | null;

  const biasIcon = bias === "bullish" ? "🟢 ALCISTA" : bias === "bearish" ? "🔴 BAJISTA" : "🟡 NEUTRAL";

  let result = `**🧠 Análisis SMC Profesional — ${symbol}**\n\n`;
  result += `**Sesgo del mercado:** ${biasIcon}\n\n`;

  // Structures found
  result += `**Estructuras detectadas:**\n`;
  result += `| Estructura | Cantidad | Últimas |\n|---|---|---|\n`;
  result += `| Order Blocks | ${orderBlocks.length} | ${orderBlocks.slice(-2).map(ob => `${ob.type === "bullish" ? "🟢" : "🔴"} $${(ob.bottom as number)?.toFixed(2)}-$${(ob.top as number)?.toFixed(2)}`).join(", ") || "—"} |\n`;
  result += `| Fair Value Gaps | ${fvgs.length} | ${fvgs.filter(f => !f.mitigated).length} sin mitigar |\n`;
  result += `| Break of Structure | ${bos.length} | ${bos.slice(-1).map(b => b.type === "bullish" ? "🟢 Alcista" : "🔴 Bajista").join("") || "—"} |\n`;
  result += `| Change of Character | ${choch.length} | ${choch.slice(-1).map(c => c.type === "bullish" ? "🟢 Alcista" : "🔴 Bajista").join("") || "—"} |\n`;
  result += `| Liquidity Sweeps | ${sweeps.length} | ${sweeps.slice(-1).map(s => (s.sweep_type as string)?.includes("bullish") ? "🟢 Sweep bajista→alcista" : "🔴 Sweep alcista→bajista").join("") || "—"} |\n\n`;

  // Sweep alerts
  if (sweeps.length > 0) {
    result += `**⚠️ Sweeps de liquidez detectados:**\n`;
    for (const s of sweeps.slice(-3)) {
      const type = (s.sweep_type as string)?.includes("bullish") ? "Alcista (sweep de mínimos)" : "Bajista (sweep de máximos)";
      result += `- ${type} en nivel $${(s.level as number)?.toFixed(2)} — confianza: ${s.confidence}%\n`;
    }
    result += `\n`;
  }

  // Signal
  if (signal) {
    const side = signal.side === "BUY" ? "🟢 COMPRA" : "🔴 VENTA";
    result += `**🎯 SEÑAL GENERADA:**\n\n`;
    result += `| Campo | Detalle |\n|---|---|\n`;
    result += `| Dirección | ${side} |\n`;
    result += `| Entrada | $${(signal.entry_price as number)?.toFixed(2)} |\n`;
    result += `| Stop Loss | $${(signal.stop_loss as number)?.toFixed(2)} |\n`;
    result += `| Take Profit 1 | $${(signal.take_profit as number)?.toFixed(2)} |\n`;
    if (signal.take_profit_2) result += `| Take Profit 2 | $${(signal.take_profit_2 as number)?.toFixed(2)} |\n`;
    result += `| Ratio R:R | 1:${(signal.risk_reward_ratio as number)?.toFixed(1)} |\n`;
    result += `| Setup | ${signal.setup_type} |\n`;
    result += `| Confianza | ${"⭐".repeat(Math.ceil((signal.confidence as number) / 20))}${"☆".repeat(5 - Math.ceil((signal.confidence as number) / 20))} ${signal.confidence}% |\n`;

    if (posSizing) {
      result += `| Acciones | ${posSizing.shares} |\n`;
      result += `| Riesgo | €${(posSizing.risk_amount as number)?.toFixed(0)} |\n`;
      result += `| Valor posición | $${(posSizing.position_value as number)?.toFixed(0)} |\n`;
    }

    result += `\n**Confluencias:**\n`;
    for (const r of (signal.reasoning as string[]) || []) {
      result += `- ${r}\n`;
    }

    result += `\n**Invalidación:** ${signal.invalidation}\n`;

    // Risk decision
    if (riskDecision) {
      const passed = riskDecision.passed as boolean;
      result += `\n**Risk Engine:** ${passed ? "✅ APROBADO" : "❌ RECHAZADO"} — ${riskDecision.reason}\n`;
    }
  } else {
    result += `_No se generó señal — no hay suficientes confluencias SMC para una entrada segura. Esto es bueno: no operar es también ganar._\n`;
  }

  result += `\n_Análisis SMC profesional via DILO Trading Engine. La decisión final es tuya._`;
  return result;
}
