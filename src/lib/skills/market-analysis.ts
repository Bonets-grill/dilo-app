import OpenAI from "openai";
import {
  getRecommendations,
  getPriceTarget,
  getCompanyProfile,
  getQuote,
  getBasicFinancials,
  getNewsSentiment,
  getCompanyNews,
  getMarketNews,
  getEarningsCalendar,
  getPeers,
} from "@/lib/finnhub/client";
import { analyzeSMC, isEngineAvailable, formatSMCAnalysis } from "@/lib/trading/engine-client";

const DISCLAIMER = "\n\n_Datos de analistas profesionales de Wall Street via Finnhub. La decisión final es tuya. Todo trading conlleva riesgo._";

// ══════════════════════════════════════
// TOOLS
// ══════════════════════════════════════

export const MARKET_ANALYSIS_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "market_analyze_stock",
      description: "Deep analysis of a specific stock: price, analyst recommendations, price targets, fundamentals, news sentiment, risk level. Use when user asks about a specific stock or wants to know if it's a good opportunity.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL, TSLA, NVDA, AMZN)" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "market_scan_opportunities",
      description: "Scan the market for trading opportunities: latest market news, upcoming earnings, market sentiment. Use when user asks 'what should I trade?', 'opportunities', 'what's happening in the market?', or wants a market overview.",
      parameters: {
        type: "object",
        properties: {
          sector: { type: "string", description: "Optional sector focus: technology, healthcare, finance, energy, etc." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "market_compare_stocks",
      description: "Compare two or more stocks side by side: price, P/E, analyst ratings, sentiment. Use when user wants to compare options.",
      parameters: {
        type: "object",
        properties: {
          symbols: { type: "array", items: { type: "string" }, description: "Stock symbols to compare (e.g. ['AAPL', 'MSFT', 'GOOGL'])" },
        },
        required: ["symbols"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "market_earnings_calendar",
      description: "Show upcoming earnings reports this week. Use when user asks about earnings or wants to know which companies are reporting soon.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ══════════════════════════════════════
// EXECUTION
// ══════════════════════════════════════

export async function executeMarketAnalysis(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (toolName) {
      case "market_analyze_stock": return await doAnalyzeStock(input.symbol as string);
      case "market_scan_opportunities": return await doScanOpportunities(input.sector as string | undefined);
      case "market_compare_stocks": return await doCompareStocks(input.symbols as string[]);
      case "market_earnings_calendar": return await doEarningsCalendar();
      default: return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`[Market] ${toolName} error:`, err);
    return JSON.stringify({ error: `Error: ${(err as Error).message}` });
  }
}

// ── Analyze Stock ──

async function doAnalyzeStock(symbol: string): Promise<string> {
  const sym = symbol.toUpperCase();

  const [profile, quote, recs, target, financials, sentiment] = await Promise.all([
    getCompanyProfile(sym).catch(() => null),
    getQuote(sym).catch(() => null),
    getRecommendations(sym).catch(() => []),
    getPriceTarget(sym).catch(() => null),
    getBasicFinancials(sym).catch(() => null),
    getNewsSentiment(sym).catch(() => null),
  ]);

  if (!quote || quote.c === 0) {
    return `No encontré datos para el símbolo "${sym}". Verifica que es un ticker válido del mercado US (ej: AAPL, TSLA, NVDA).`;
  }

  let result = `**📊 Análisis de ${profile?.name || sym} (${sym})**\n\n`;

  // Price
  const changeIcon = quote.d >= 0 ? "🟢" : "🔴";
  result += `**Precio actual:** $${quote.c.toFixed(2)} ${changeIcon} ${quote.d >= 0 ? "+" : ""}${quote.d?.toFixed(2)} (${quote.dp >= 0 ? "+" : ""}${quote.dp?.toFixed(2)}%)\n`;
  result += `Rango hoy: $${quote.l?.toFixed(2)} — $${quote.h?.toFixed(2)} | Cierre anterior: $${quote.pc?.toFixed(2)}\n\n`;

  // Company info
  if (profile) {
    const mcap = profile.marketCapitalization;
    const mcapStr = mcap > 1000 ? `$${(mcap / 1000).toFixed(1)}T` : mcap > 1 ? `$${mcap.toFixed(1)}B` : `$${(mcap * 1000).toFixed(0)}M`;
    result += `**Sector:** ${profile.finnhubIndustry} | **Cap. mercado:** ${mcapStr}\n\n`;
  }

  // Analyst recommendations
  if (recs.length > 0) {
    const latest = recs[0];
    const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
    const buyPct = total > 0 ? ((latest.strongBuy + latest.buy) / total * 100) : 0;
    const holdPct = total > 0 ? (latest.hold / total * 100) : 0;
    const sellPct = total > 0 ? ((latest.sell + latest.strongSell) / total * 100) : 0;

    result += `**Analistas de Wall Street** (${latest.period}):\n`;
    result += `| Rating | Cantidad | % |\n|---|---|---|\n`;
    result += `| 🟢 Strong Buy | ${latest.strongBuy} | |\n`;
    result += `| 🟢 Buy | ${latest.buy} | ${buyPct.toFixed(0)}% compra |\n`;
    result += `| 🟡 Hold | ${latest.hold} | ${holdPct.toFixed(0)}% mantener |\n`;
    result += `| 🔴 Sell | ${latest.sell} | ${sellPct.toFixed(0)}% venta |\n`;
    result += `| 🔴 Strong Sell | ${latest.strongSell} | |\n`;
    result += `| **Total analistas** | **${total}** | |\n\n`;
  }

  // Price target
  if (target && target.targetMean > 0) {
    const upside = ((target.targetMean - quote.c) / quote.c * 100);
    result += `**Price Target de analistas:**\n`;
    result += `| Métrica | Valor |\n|---|---|\n`;
    result += `| Objetivo medio | $${target.targetMean.toFixed(2)} (${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%) |\n`;
    result += `| Objetivo alto | $${target.targetHigh.toFixed(2)} |\n`;
    result += `| Objetivo bajo | $${target.targetLow.toFixed(2)} |\n\n`;
  }

  // Fundamentals
  if (financials?.metric) {
    const m = financials.metric;
    result += `**Fundamentales:**\n`;
    result += `| Métrica | Valor |\n|---|---|\n`;
    if (m.peBasicExclExtraTTM) result += `| P/E Ratio | ${m.peBasicExclExtraTTM.toFixed(1)} |\n`;
    if (m.epsBasicExclExtraItemsTTM) result += `| EPS (TTM) | $${m.epsBasicExclExtraItemsTTM.toFixed(2)} |\n`;
    if (m.roeTTM) result += `| ROE | ${m.roeTTM.toFixed(1)}% |\n`;
    if (m.beta) result += `| Beta | ${m.beta.toFixed(2)} |\n`;
    if (m.dividendYieldIndicatedAnnual) result += `| Dividendo | ${m.dividendYieldIndicatedAnnual.toFixed(2)}% |\n`;
    if (m["52WeekHigh"]) result += `| 52W High | $${m["52WeekHigh"].toFixed(2)} |\n`;
    if (m["52WeekLow"]) result += `| 52W Low | $${m["52WeekLow"].toFixed(2)} |\n`;
    result += `\n`;
  }

  // Sentiment
  if (sentiment && sentiment.sentiment) {
    const bull = (sentiment.sentiment.bullishPercent * 100);
    const bear = (sentiment.sentiment.bearishPercent * 100);
    result += `**Sentimiento de noticias:** ${bull > 60 ? "🟢" : bull > 40 ? "🟡" : "🔴"} ${bull.toFixed(0)}% positivo / ${bear.toFixed(0)}% negativo\n`;
    result += `Artículos esta semana: ${sentiment.buzz?.articlesInLastWeek || "N/A"}\n\n`;
  }

  // Risk assessment
  const beta = financials?.metric?.beta || 1;
  const riskLevel = beta > 1.5 ? 5 : beta > 1.2 ? 4 : beta > 0.8 ? 3 : beta > 0.5 ? 2 : 1;
  const riskLabels = ["", "Muy bajo", "Bajo", "Moderado", "Alto", "Muy alto"];
  result += `**Nivel de riesgo:** ${"⚡".repeat(riskLevel)}${"○".repeat(5 - riskLevel)} ${riskLabels[riskLevel]} (Beta: ${beta.toFixed(2)})\n`;

  // SMC Analysis from Python Trading Engine
  try {
    const engineUp = await isEngineAvailable();
    if (engineUp) {
      const smcData = await analyzeSMC(sym);
      if (smcData && !smcData.error) {
        result += `\n---\n\n`;
        result += formatSMCAnalysis(smcData);
      }
    }
  } catch { /* Engine unavailable — continue with Finnhub data only */ }

  return result + DISCLAIMER;
}

// ── Scan Opportunities ──

async function doScanOpportunities(sector?: string): Promise<string> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const [news, earnings] = await Promise.all([
    getMarketNews("general").catch(() => []),
    getEarningsCalendar(today, new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)).catch(() => ({ earningsCalendar: [] })),
  ]);

  // Analyze top mentioned stocks in news
  const popularSymbols = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META"];
  const sectorSymbols: Record<string, string[]> = {
    technology: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "CRM", "ADBE"],
    healthcare: ["JNJ", "UNH", "PFE", "ABBV", "MRK", "LLY", "TMO"],
    finance: ["JPM", "BAC", "GS", "MS", "V", "MA", "BRK.B"],
    energy: ["XOM", "CVX", "COP", "SLB", "EOG", "OXY", "MPC"],
  };

  const symbols = sector ? (sectorSymbols[sector.toLowerCase()] || popularSymbols) : popularSymbols;

  // Get quotes and recommendations for these symbols
  const analyses = await Promise.all(
    symbols.slice(0, 5).map(async (sym) => {
      const [quote, recs, target] = await Promise.all([
        getQuote(sym).catch(() => null),
        getRecommendations(sym).catch(() => []),
        getPriceTarget(sym).catch(() => null),
      ]);
      return { sym, quote, recs, target };
    })
  );

  let result = `**🔍 Escaneo de Mercado** ${sector ? `— Sector: ${sector}` : ""}\n`;
  result += `_${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}_\n\n`;

  // Market news summary
  if (news.length > 0) {
    result += `**Noticias principales:**\n`;
    for (const n of news.slice(0, 4)) {
      result += `- ${n.headline} _(${n.source})_\n`;
    }
    result += `\n`;
  }

  // Stock analysis table
  result += `**Acciones analizadas:**\n\n`;
  result += `| Acción | Precio | Hoy | Analistas | Target | Upside |\n|---|---|---|---|---|---|\n`;

  for (const a of analyses) {
    if (!a.quote || a.quote.c === 0) continue;
    const latest = a.recs[0];
    const totalBuy = latest ? latest.strongBuy + latest.buy : 0;
    const totalSell = latest ? latest.sell + latest.strongSell : 0;
    const total = latest ? totalBuy + latest.hold + totalSell : 0;
    const consensus = total > 0 ? (totalBuy > totalSell * 2 ? "🟢 Buy" : totalSell > totalBuy ? "🔴 Sell" : "🟡 Hold") : "—";
    const targetPrice = a.target?.targetMean || 0;
    const upside = targetPrice > 0 ? ((targetPrice - a.quote.c) / a.quote.c * 100) : 0;
    const dayIcon = a.quote.dp >= 0 ? "🟢" : "🔴";

    result += `| **${a.sym}** | $${a.quote.c.toFixed(2)} | ${dayIcon} ${a.quote.dp >= 0 ? "+" : ""}${a.quote.dp?.toFixed(1)}% | ${consensus} (${total}) | $${targetPrice.toFixed(0)} | ${upside >= 0 ? "+" : ""}${upside.toFixed(1)}% |\n`;
  }

  // Upcoming earnings
  if (earnings.earningsCalendar && earnings.earningsCalendar.length > 0) {
    const upcoming = earnings.earningsCalendar
      .filter(e => e.symbol && popularSymbols.includes(e.symbol))
      .slice(0, 5);

    if (upcoming.length > 0) {
      result += `\n**Earnings esta semana:**\n`;
      for (const e of upcoming) {
        result += `- **${e.symbol}** — ${e.date} (Est. EPS: $${e.epsEstimate?.toFixed(2) || "N/A"})\n`;
      }
    }
  }

  result += `\nPuedes decirme "analiza NVDA" para ver el análisis completo de cualquier acción.`;

  return result + DISCLAIMER;
}

// ── Compare Stocks ──

async function doCompareStocks(symbols: string[]): Promise<string> {
  const syms = symbols.map(s => s.toUpperCase()).slice(0, 5);

  const data = await Promise.all(
    syms.map(async (sym) => {
      const [profile, quote, recs, target, financials] = await Promise.all([
        getCompanyProfile(sym).catch(() => null),
        getQuote(sym).catch(() => null),
        getRecommendations(sym).catch(() => []),
        getPriceTarget(sym).catch(() => null),
        getBasicFinancials(sym).catch(() => null),
      ]);
      return { sym, profile, quote, recs, target, financials };
    })
  );

  let result = `**📊 Comparativa: ${syms.join(" vs ")}**\n\n`;
  result += `| Métrica | ${syms.map(s => `**${s}**`).join(" | ")} |\n|---|${syms.map(() => "---").join("|")}|\n`;

  // Price
  result += `| Precio | ${data.map(d => d.quote ? `$${d.quote.c.toFixed(2)}` : "—").join(" | ")} |\n`;
  result += `| Hoy | ${data.map(d => d.quote ? `${d.quote.dp >= 0 ? "+" : ""}${d.quote.dp?.toFixed(1)}%` : "—").join(" | ")} |\n`;

  // P/E
  result += `| P/E | ${data.map(d => {
    const pe = d.financials?.metric?.peBasicExclExtraTTM;
    return pe ? pe.toFixed(1) : "—";
  }).join(" | ")} |\n`;

  // Market cap
  result += `| Cap. | ${data.map(d => {
    const mc = d.profile?.marketCapitalization || 0;
    return mc > 1000 ? `$${(mc/1000).toFixed(1)}T` : mc > 0 ? `$${mc.toFixed(0)}B` : "—";
  }).join(" | ")} |\n`;

  // Analyst consensus
  result += `| Analistas | ${data.map(d => {
    const r = d.recs[0];
    if (!r) return "—";
    const buy = r.strongBuy + r.buy;
    const sell = r.sell + r.strongSell;
    return buy > sell * 2 ? `🟢 Buy (${buy})` : sell > buy ? `🔴 Sell (${sell})` : `🟡 Hold`;
  }).join(" | ")} |\n`;

  // Target upside
  result += `| Upside | ${data.map(d => {
    if (!d.target?.targetMean || !d.quote?.c) return "—";
    const up = ((d.target.targetMean - d.quote.c) / d.quote.c * 100);
    return `${up >= 0 ? "+" : ""}${up.toFixed(1)}%`;
  }).join(" | ")} |\n`;

  // Beta
  result += `| Beta | ${data.map(d => {
    const b = d.financials?.metric?.beta;
    return b ? b.toFixed(2) : "—";
  }).join(" | ")} |\n`;

  // Dividend
  result += `| Dividendo | ${data.map(d => {
    const div = d.financials?.metric?.dividendYieldIndicatedAnnual;
    return div ? `${div.toFixed(2)}%` : "—";
  }).join(" | ")} |\n`;

  return result + DISCLAIMER;
}

// ── Earnings Calendar ──

async function doEarningsCalendar(): Promise<string> {
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const data = await getEarningsCalendar(from, to);
  const events = data.earningsCalendar || [];

  if (events.length === 0) {
    return "No hay earnings programados para esta semana.";
  }

  // Group by date
  const byDate: Record<string, typeof events> = {};
  for (const e of events.slice(0, 30)) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }

  let result = `**📅 Calendario de Earnings** (próximos 7 días)\n\n`;

  for (const [date, evts] of Object.entries(byDate).sort()) {
    const dayName = new Date(date).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
    result += `**${dayName}:**\n`;
    for (const e of evts.slice(0, 8)) {
      const est = e.epsEstimate !== null ? `Est: $${e.epsEstimate.toFixed(2)}` : "";
      result += `- **${e.symbol}** ${est}\n`;
    }
    result += `\n`;
  }

  result += `_Los earnings pueden generar movimientos grandes. Investiga antes de operar en estas fechas._`;
  return result + DISCLAIMER;
}
