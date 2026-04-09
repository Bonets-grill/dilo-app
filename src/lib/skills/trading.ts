import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  getAccount,
  getPositions,
  getOrders,
  getPortfolioHistory,
  getActivities,
  placeOrder,
  type OrderRequest,
  type AlpacaAuth,
} from "@/lib/alpaca/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DISCLAIMER = "\n\n_Datos reales de tu cuenta. Esto NO es asesoramiento financiero. Rendimientos pasados no garantizan resultados futuros._";

// ══════════════════════════════════════
// TOOLS DEFINITION
// ══════════════════════════════════════

export const TRADING_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "trading_portfolio",
      description: "View the user's current trading portfolio: account balance, positions, unrealized P&L. Use when user asks about their portfolio, positions, stocks, or account.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_performance",
      description: "Show trading performance statistics: win rate, avg win/loss, profit factor, streaks. Use when user asks about their trading performance or results.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "week", "month", "3months", "year", "all"], description: "Time period for stats (default: month)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_journal_sync",
      description: "Import/sync recent trades from the broker into the trading journal. Use when user wants to update their journal or after new trades.",
      parameters: {
        type: "object",
        properties: {
          days_back: { type: "number", description: "How many days back to sync (default: 30, max: 90)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_journal_annotate",
      description: "Add notes, tags, emotion, or setup type to a trade in the journal. Use when user wants to annotate or tag their trades.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Stock symbol of the trade" },
          notes: { type: "string", description: "User notes about the trade" },
          tags: { type: "array", items: { type: "string" }, description: "Tags: swing, scalp, earnings, breakout, etc." },
          emotion: { type: "string", enum: ["confident", "fearful", "fomo", "revenge", "disciplined", "impatient", "neutral"], description: "How user felt during the trade" },
          setup: { type: "string", description: "Trade setup type: breakout, support_bounce, trend_follow, etc." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_risk_analysis",
      description: "Analyze current portfolio risk: concentration, largest positions, total exposure. Use when user asks about portfolio risk or diversification.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_rules_set",
      description: "Set or update trading risk management rules. Use when user wants to set limits on their trading.",
      parameters: {
        type: "object",
        properties: {
          max_trades_per_day: { type: "number", description: "Maximum trades allowed per day" },
          max_loss_per_day: { type: "number", description: "Maximum loss in USD allowed per day" },
          max_position_size_pct: { type: "number", description: "Max % of portfolio in a single position" },
          max_portfolio_loss_pct: { type: "number", description: "Stop-all trigger if portfolio drops this %" },
          no_trading_hours: { type: "string", description: "Hours to block trading, e.g. '15:00-16:00' (market close volatility)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_rules_check",
      description: "Check if a proposed trade would violate the user's risk rules. Use before placing any trade.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Stock symbol" },
          side: { type: "string", enum: ["buy", "sell"], description: "Buy or sell" },
          qty: { type: "number", description: "Number of shares" },
        },
        required: ["symbol", "side", "qty"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_place_order",
      description: "Place a trade order. ALWAYS show preview first (confirmed=false), then ask user to confirm. NEVER place without explicit user confirmation.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Stock symbol (e.g. AAPL, TSLA)" },
          side: { type: "string", enum: ["buy", "sell"], description: "Buy or sell" },
          qty: { type: "number", description: "Number of shares" },
          type: { type: "string", enum: ["market", "limit", "stop", "stop_limit"], description: "Order type (default: market)" },
          limit_price: { type: "number", description: "Limit price (required for limit/stop_limit orders)" },
          confirmed: { type: "boolean", description: "Set true ONLY after user explicitly confirms. Default false = preview only." },
        },
        required: ["symbol", "side", "qty"],
      },
    },
  },
];

// ══════════════════════════════════════
// EXECUTION
// ══════════════════════════════════════

export async function executeTrading(
  toolName: string,
  input: Record<string, unknown>,
  auth: AlpacaAuth,
  userId: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "trading_portfolio": return await doPortfolio(auth);
      case "trading_performance": return await doPerformance(userId, input.period as string);
      case "trading_journal_sync": return await doJournalSync(auth, userId, input.days_back as number);
      case "trading_journal_annotate": return await doJournalAnnotate(userId, input as Record<string, unknown>);
      case "trading_risk_analysis": return await doRiskAnalysis(auth);
      case "trading_rules_set": return await doRulesSet(userId, input);
      case "trading_rules_check": return await doRulesCheck(auth, userId, input);
      case "trading_place_order": return await doPlaceOrder(auth, userId, input);
      default: return JSON.stringify({ error: `Unknown trading tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`[Trading] ${toolName} error:`, err);
    return JSON.stringify({ error: `Error executing ${toolName}: ${(err as Error).message}` });
  }
}

// ── Portfolio ──

async function doPortfolio(auth: AlpacaAuth): Promise<string> {
  const [account, positions] = await Promise.all([
    getAccount(auth),
    getPositions(auth),
  ]);

  const equity = parseFloat(account.equity);
  const lastEquity = parseFloat(account.last_equity);
  const cash = parseFloat(account.cash);
  const buyingPower = parseFloat(account.buying_power);
  const dayPnl = equity - lastEquity;
  const dayPnlPct = lastEquity > 0 ? (dayPnl / lastEquity * 100) : 0;
  const invested = equity - cash;
  const investedPct = equity > 0 ? (invested / equity * 100) : 0;
  const mode = auth.paperMode ? "PAPER TRADING" : "LIVE";

  let result = `**📊 Dashboard de Trading** _(${mode})_\n\n`;

  // Account metrics
  result += `| Métrica | Valor |\n|---|---|\n`;
  result += `| Valor total | $${equity.toLocaleString("en-US", { minimumFractionDigits: 2 })} |\n`;
  result += `| Invertido | $${invested.toFixed(2)} (${investedPct.toFixed(1)}%) |\n`;
  result += `| Cash disponible | $${cash.toLocaleString("en-US", { minimumFractionDigits: 2 })} |\n`;
  result += `| Poder de compra | $${buyingPower.toLocaleString("en-US", { minimumFractionDigits: 2 })} |\n`;
  result += `| P&L hoy | ${dayPnl >= 0 ? "🟢 +" : "🔴 "}$${Math.abs(dayPnl).toFixed(2)} (${dayPnlPct >= 0 ? "+" : ""}${dayPnlPct.toFixed(2)}%) |\n`;
  result += `| Day trades (90 días) | ${account.daytrade_count} |\n`;

  if (positions.length > 0) {
    // Sort by market value descending
    const sorted = [...positions].sort((a, b) => Math.abs(parseFloat(b.market_value)) - Math.abs(parseFloat(a.market_value)));

    result += `\n**Posiciones abiertas (${positions.length}):**\n\n`;
    result += `| Símbolo | Cant. | Entrada | Actual | P&L | % |\n|---|---|---|---|---|---|\n`;

    let totalUpl = 0;
    for (const p of sorted) {
      const upl = parseFloat(p.unrealized_pl);
      const uplPct = parseFloat(p.unrealized_plpc) * 100;
      totalUpl += upl;
      const icon = upl >= 0 ? "🟢" : "🔴";
      result += `| ${icon} **${p.symbol}** | ${p.qty} | $${parseFloat(p.avg_entry_price).toFixed(2)} | $${parseFloat(p.current_price).toFixed(2)} | ${upl >= 0 ? "+" : ""}$${upl.toFixed(2)} | ${uplPct >= 0 ? "+" : ""}${uplPct.toFixed(1)}% |\n`;
    }

    result += `\n**P&L total no realizado:** ${totalUpl >= 0 ? "🟢 +" : "🔴 "}$${Math.abs(totalUpl).toFixed(2)}\n`;

    // Quick risk check
    const largestPct = Math.abs(parseFloat(sorted[0].market_value)) / equity * 100;
    if (largestPct > 25) {
      result += `\n⚠️ **${sorted[0].symbol}** ocupa el ${largestPct.toFixed(1)}% de tu portfolio — concentración alta.\n`;
    }
  } else {
    result += `\nNo tienes posiciones abiertas. Tu portfolio es 100% cash.\n`;
    result += `\nPuedes pedirme:\n- "Analiza el riesgo de mi portfolio"\n- "Configura reglas de trading"\n- "Muestra mi rendimiento"\n`;
  }

  return result + DISCLAIMER;
}

// ── Performance ──

async function doPerformance(userId: string, period?: string): Promise<string> {
  const p = period || "month";
  const now = new Date();
  let fromDate: Date;

  switch (p) {
    case "today": fromDate = new Date(now.toISOString().slice(0, 10)); break;
    case "week": fromDate = new Date(now); fromDate.setDate(now.getDate() - 7); break;
    case "3months": fromDate = new Date(now); fromDate.setMonth(now.getMonth() - 3); break;
    case "year": fromDate = new Date(now); fromDate.setFullYear(now.getFullYear() - 1); break;
    case "all": fromDate = new Date("2020-01-01"); break;
    default: fromDate = new Date(now); fromDate.setMonth(now.getMonth() - 1); break;
  }

  const { data: trades } = await supabase
    .from("trade_journal")
    .select("*")
    .eq("user_id", userId)
    .gte("filled_at", fromDate.toISOString())
    .order("filled_at", { ascending: true });

  if (!trades || trades.length === 0) {
    return `No hay trades registrados en este período (${p}). Usa "sincronizar journal" para importar tus trades.` + DISCLAIMER;
  }

  // Calculate stats from sells (closed trades with P&L)
  const closedTrades = trades.filter(t => t.side === "sell" && t.pnl !== null);
  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl <= 0);

  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const winRate = closedTrades.length ? (wins.length / closedTrades.length * 100) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : wins.length > 0 ? Infinity : 0;

  // Streaks
  let curStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
  for (const t of closedTrades) {
    if (t.pnl > 0) {
      curStreak = curStreak > 0 ? curStreak + 1 : 1;
      maxWinStreak = Math.max(maxWinStreak, curStreak);
    } else {
      curStreak = curStreak < 0 ? curStreak - 1 : -1;
      maxLossStreak = Math.max(maxLossStreak, Math.abs(curStreak));
    }
  }

  // Best and worst trade
  const best = closedTrades.reduce((a, b) => (a.pnl || 0) > (b.pnl || 0) ? a : b, closedTrades[0]);
  const worst = closedTrades.reduce((a, b) => (a.pnl || 0) < (b.pnl || 0) ? a : b, closedTrades[0]);

  const periodLabel: Record<string, string> = { today: "hoy", week: "esta semana", month: "este mes", "3months": "3 meses", year: "este año", all: "todo el historial" };

  let result = `**Rendimiento — ${periodLabel[p] || p}**\n\n`;
  result += `| Métrica | Valor |\n|---|---|\n`;
  result += `| Trades cerrados | ${closedTrades.length} |\n`;
  result += `| Win Rate | ${winRate.toFixed(1)}% |\n`;
  result += `| P&L Total | ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)} |\n`;
  result += `| Ganancia media | +$${avgWin.toFixed(2)} |\n`;
  result += `| Pérdida media | -$${avgLoss.toFixed(2)} |\n`;
  result += `| Profit Factor | ${profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)} |\n`;
  result += `| Mejor racha | ${maxWinStreak} wins seguidos |\n`;
  result += `| Peor racha | ${maxLossStreak} losses seguidos |\n`;
  result += `| Mejor trade | ${best?.symbol} +$${(best?.pnl || 0).toFixed(2)} |\n`;
  result += `| Peor trade | ${worst?.symbol} $${(worst?.pnl || 0).toFixed(2)} |\n`;

  return result + DISCLAIMER;
}

// ── Journal Sync ──

async function doJournalSync(auth: AlpacaAuth, userId: string, daysBack?: number): Promise<string> {
  const days = Math.min(daysBack || 30, 90);
  const after = new Date();
  after.setDate(after.getDate() - days);

  const activities = await getActivities(auth, {
    activity_types: "FILL",
    after: after.toISOString(),
    direction: "asc",
    page_size: 500,
  });

  if (!activities || activities.length === 0) {
    return `No hay trades nuevos en los últimos ${days} días.`;
  }

  let imported = 0;
  let skipped = 0;

  for (const a of activities) {
    // Check if already exists
    const { data: existing } = await supabase
      .from("trade_journal")
      .select("id")
      .eq("alpaca_order_id", a.order_id)
      .eq("user_id", userId)
      .limit(1);

    if (existing && existing.length > 0) { skipped++; continue; }

    const qty = parseFloat(a.qty);
    const price = parseFloat(a.price);

    await supabase.from("trade_journal").insert({
      user_id: userId,
      alpaca_order_id: a.order_id,
      symbol: a.symbol,
      side: a.side === "buy" ? "buy" : "sell",
      qty,
      price,
      total_amount: qty * price,
      filled_at: a.transaction_time,
    });
    imported++;
  }

  // Calculate P&L for sell trades that don't have it yet
  await calculatePnL(userId);

  return `Journal sincronizado: ${imported} trades importados, ${skipped} ya existían. Total en los últimos ${days} días.`;
}

async function calculatePnL(userId: string) {
  // Get all trades ordered by time
  const { data: trades } = await supabase
    .from("trade_journal")
    .select("*")
    .eq("user_id", userId)
    .order("filled_at", { ascending: true });

  if (!trades) return;

  // Track average cost basis per symbol
  const positions: Record<string, { qty: number; avgCost: number }> = {};

  for (const t of trades) {
    const sym = t.symbol;
    if (!positions[sym]) positions[sym] = { qty: 0, avgCost: 0 };

    if (t.side === "buy") {
      const totalCost = positions[sym].qty * positions[sym].avgCost + t.qty * t.price;
      positions[sym].qty += t.qty;
      positions[sym].avgCost = positions[sym].qty > 0 ? totalCost / positions[sym].qty : 0;
    } else if (t.side === "sell" && t.pnl === null) {
      const pnl = (t.price - positions[sym].avgCost) * t.qty;
      const pnlPct = positions[sym].avgCost > 0 ? (pnl / (positions[sym].avgCost * t.qty)) * 100 : 0;
      positions[sym].qty -= t.qty;

      await supabase.from("trade_journal").update({ pnl, pnl_pct: pnlPct }).eq("id", t.id);
    }
  }
}

// ── Journal Annotate ──

async function doJournalAnnotate(userId: string, input: Record<string, unknown>): Promise<string> {
  const symbol = (input.symbol as string).toUpperCase();

  const { data: trade } = await supabase
    .from("trade_journal")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .order("filled_at", { ascending: false })
    .limit(1)
    .single();

  if (!trade) return `No encontré trades de ${symbol} en tu journal.`;

  const updates: Record<string, unknown> = {};
  if (input.notes) updates.notes = input.notes;
  if (input.tags) updates.tags = input.tags;
  if (input.emotion) updates.emotion = input.emotion;
  if (input.setup) updates.setup = input.setup;

  await supabase.from("trade_journal").update(updates).eq("id", trade.id);

  return `Trade de ${symbol} (${trade.side} ${trade.qty} @ $${trade.price}) anotado correctamente.`;
}

// ── Risk Analysis ──

async function doRiskAnalysis(auth: AlpacaAuth): Promise<string> {
  const [account, positions] = await Promise.all([
    getAccount(auth),
    getPositions(auth),
  ]);

  const equity = parseFloat(account.equity);

  if (positions.length === 0) {
    return "No tienes posiciones abiertas. Tu riesgo actual es 0." + DISCLAIMER;
  }

  // Concentration analysis
  const posData = positions.map(p => ({
    symbol: p.symbol,
    value: Math.abs(parseFloat(p.market_value)),
    pct: Math.abs(parseFloat(p.market_value)) / equity * 100,
    upl: parseFloat(p.unrealized_pl),
    uplPct: parseFloat(p.unrealized_plpc) * 100,
  })).sort((a, b) => b.pct - a.pct);

  const totalExposure = posData.reduce((s, p) => s + p.value, 0);
  const exposurePct = (totalExposure / equity * 100);
  const largestPos = posData[0];
  const totalUpl = posData.reduce((s, p) => s + p.upl, 0);

  let result = `**Análisis de Riesgo**\n\n`;
  result += `- Exposición total: $${totalExposure.toFixed(2)} (${exposurePct.toFixed(1)}% del portfolio)\n`;
  result += `- P&L no realizado: ${totalUpl >= 0 ? "+" : ""}$${totalUpl.toFixed(2)}\n`;
  result += `- Posición más grande: **${largestPos.symbol}** (${largestPos.pct.toFixed(1)}% del portfolio)\n`;
  result += `- Número de posiciones: ${positions.length}\n\n`;

  // Concentration warnings
  const warnings: string[] = [];
  if (largestPos.pct > 25) warnings.push(`**${largestPos.symbol}** ocupa ${largestPos.pct.toFixed(1)}% — concentración alta`);
  if (positions.length < 3 && totalExposure > equity * 0.3) warnings.push("Pocas posiciones con alta exposición — baja diversificación");
  if (exposurePct > 90) warnings.push("Exposición total superior al 90% — poco margen de maniobra");

  const losers = posData.filter(p => p.uplPct < -10);
  for (const l of losers) {
    warnings.push(`**${l.symbol}** tiene una pérdida no realizada de ${l.uplPct.toFixed(1)}%`);
  }

  if (warnings.length > 0) {
    result += `**Señales de atención:**\n`;
    for (const w of warnings) result += `- ${w}\n`;
  } else {
    result += `No se detectan señales de riesgo elevado.\n`;
  }

  result += `\n**Distribución:**\n`;
  for (const p of posData) {
    const bar = "█".repeat(Math.max(1, Math.round(p.pct / 5)));
    result += `${p.symbol.padEnd(6)} ${bar} ${p.pct.toFixed(1)}%\n`;
  }

  return result + DISCLAIMER;
}

// ── Rules Set ──

async function doRulesSet(userId: string, input: Record<string, unknown>): Promise<string> {
  const updates: Record<string, unknown> = { user_id: userId, active: true, updated_at: new Date().toISOString() };
  if (input.max_trades_per_day !== undefined) updates.max_trades_per_day = input.max_trades_per_day;
  if (input.max_loss_per_day !== undefined) updates.max_loss_per_day = input.max_loss_per_day;
  if (input.max_position_size_pct !== undefined) updates.max_position_size_pct = input.max_position_size_pct;
  if (input.max_portfolio_loss_pct !== undefined) updates.max_portfolio_loss_pct = input.max_portfolio_loss_pct;
  if (input.no_trading_hours !== undefined) updates.no_trading_hours = input.no_trading_hours;

  const { data: existing } = await supabase
    .from("trading_rules")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase.from("trading_rules").update(updates).eq("user_id", userId);
  } else {
    await supabase.from("trading_rules").insert(updates);
  }

  const parts: string[] = [];
  if (input.max_trades_per_day) parts.push(`Máx. ${input.max_trades_per_day} trades/día`);
  if (input.max_loss_per_day) parts.push(`Máx. pérdida diaria: $${input.max_loss_per_day}`);
  if (input.max_position_size_pct) parts.push(`Máx. por posición: ${input.max_position_size_pct}%`);
  if (input.max_portfolio_loss_pct) parts.push(`Stop total: -${input.max_portfolio_loss_pct}%`);
  if (input.no_trading_hours) parts.push(`Sin operar: ${input.no_trading_hours}`);

  return `Reglas de riesgo actualizadas:\n${parts.map(p => `- ${p}`).join("\n")}\n\nEstas reglas se verificarán antes de cada operación.`;
}

// ── Rules Check ──

async function doRulesCheck(auth: AlpacaAuth, userId: string, input: Record<string, unknown>): Promise<string> {
  const symbol = (input.symbol as string).toUpperCase();
  const side = input.side as string;
  const qty = input.qty as number;

  const { data: rules } = await supabase
    .from("trading_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .single();

  if (!rules) return JSON.stringify({ allowed: true, message: "No tienes reglas de riesgo configuradas. La operación puede proceder." });

  const violations: string[] = [];
  const account = await getAccount(auth);
  const equity = parseFloat(account.equity);

  // Check max trades per day
  if (rules.max_trades_per_day) {
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await supabase
      .from("trade_journal")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("filled_at", today);

    if ((count || 0) >= rules.max_trades_per_day) {
      violations.push(`Has alcanzado el límite de ${rules.max_trades_per_day} trades hoy (llevas ${count})`);
    }
  }

  // Check max daily loss
  if (rules.max_loss_per_day) {
    const lastEquity = parseFloat(account.last_equity);
    const dayLoss = equity - lastEquity;
    if (dayLoss < 0 && Math.abs(dayLoss) >= rules.max_loss_per_day) {
      violations.push(`Has perdido $${Math.abs(dayLoss).toFixed(2)} hoy (límite: $${rules.max_loss_per_day})`);
    }
  }

  // Check max position size
  if (rules.max_position_size_pct && side === "buy") {
    // Estimate position value — we'd need current price, approximate with a round number
    const positions = await getPositions(auth);
    const existingPos = positions.find(p => p.symbol === symbol);
    const existingValue = existingPos ? Math.abs(parseFloat(existingPos.market_value)) : 0;
    const currentPrice = existingPos ? parseFloat(existingPos.current_price) : 0;
    const newValue = existingValue + (currentPrice > 0 ? currentPrice * qty : 0);
    const posPct = (newValue / equity) * 100;

    if (posPct > rules.max_position_size_pct) {
      violations.push(`La posición en ${symbol} sería ${posPct.toFixed(1)}% del portfolio (límite: ${rules.max_position_size_pct}%)`);
    }
  }

  // Check blocked symbols
  if (rules.blocked_symbols?.includes(symbol)) {
    violations.push(`${symbol} está en tu lista de símbolos bloqueados`);
  }

  if (violations.length > 0) {
    return JSON.stringify({
      allowed: false,
      violations,
      message: `BLOQUEADO por reglas de riesgo:\n${violations.map(v => `- ${v}`).join("\n")}`,
    });
  }

  return JSON.stringify({ allowed: true, message: "La operación cumple con todas tus reglas de riesgo." });
}

// ── Place Order ──

async function doPlaceOrder(auth: AlpacaAuth, userId: string, input: Record<string, unknown>): Promise<string> {
  const symbol = (input.symbol as string).toUpperCase();
  const side = input.side as "buy" | "sell";
  const qty = input.qty as number;
  const orderType = (input.type as string) || "market";
  const limitPrice = input.limit_price as number | undefined;
  const confirmed = input.confirmed === true;

  // ALWAYS check rules first
  const ruleResult = await doRulesCheck(auth, userId, { symbol, side, qty });
  const ruleData = JSON.parse(ruleResult);

  if (!ruleData.allowed) {
    return `No puedo ejecutar esta orden.\n\n${ruleData.message}\n\nSi quieres proceder de todas formas, primero modifica tus reglas de riesgo.`;
  }

  if (!confirmed) {
    // Preview mode
    const account = await getAccount(auth);
    const positions = await getPositions(auth);
    const existingPos = positions.find(p => p.symbol === symbol);

    let preview = `**Preview de orden:**\n`;
    preview += `- Acción: ${side === "buy" ? "COMPRAR" : "VENDER"} ${qty} x ${symbol}\n`;
    preview += `- Tipo: ${orderType}${limitPrice ? ` @ $${limitPrice}` : ""}\n`;
    preview += `- Cash disponible: $${parseFloat(account.cash).toFixed(2)}\n`;

    if (existingPos) {
      preview += `- Posición actual: ${existingPos.qty} acciones @ $${parseFloat(existingPos.avg_entry_price).toFixed(2)}\n`;
    }

    preview += `\n¿Confirmas esta operación?`;
    preview += DISCLAIMER;
    return preview;
  }

  // Execute
  const order: OrderRequest = {
    symbol,
    qty: String(qty),
    side,
    type: orderType as OrderRequest["type"],
    time_in_force: "day",
  };
  if (limitPrice) order.limit_price = String(limitPrice);

  const result = await placeOrder(auth, order);

  return `Orden ejecutada:\n- ${side === "buy" ? "COMPRA" : "VENTA"} ${qty} x ${symbol}\n- Status: ${result.status}\n- ID: ${result.id}` + DISCLAIMER;
}
