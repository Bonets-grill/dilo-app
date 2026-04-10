/**
 * Forex/Gold Trading Tools — for DILO chat
 * Uses IG Markets via Python engine endpoints.
 * NEW FILE — does not modify any existing skills.
 */

import OpenAI from "openai";
import {
  analyzeForex,
  analyzeForexMTF,
  getForexQuote,
  getForexAccount,
  getForexPositions,
  isForexAvailable,
  formatInstrument,
} from "@/lib/ig/client";

const DISCLAIMER = "\n\n_Datos de mercado en tiempo real via IG Markets. Esto es un CFD — trading con apalancamiento. La decisión final es tuya. Todo trading conlleva riesgo de pérdida._";

// ══════════════════════════════════════
// TOOLS
// ══════════════════════════════════════

export const FOREX_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "forex_analyze",
      description: "Analyze a forex pair or gold with SMC (Smart Money Concepts). Use when user asks about EUR/USD, GBP/JPY, gold, XAU/USD, etc.",
      parameters: {
        type: "object",
        properties: {
          instrument: { type: "string", description: "Forex pair or gold: EUR/USD, GBP/JPY, XAU/USD, etc." },
        },
        required: ["instrument"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forex_analyze_mtf",
      description: "Multi-timeframe analysis of forex/gold (Weekly + Daily + H1). More thorough analysis. Use when user asks for deep analysis or 'análisis completo' of a forex pair.",
      parameters: {
        type: "object",
        properties: {
          instrument: { type: "string", description: "Forex pair: EUR/USD, GBP/JPY, XAU/USD, etc." },
        },
        required: ["instrument"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forex_quote",
      description: "Get current price of a forex pair or gold. Use when user asks 'price of gold', 'EUR/USD now', etc.",
      parameters: {
        type: "object",
        properties: {
          instrument: { type: "string", description: "Forex pair: EUR/USD, XAU/USD, etc." },
        },
        required: ["instrument"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forex_account",
      description: "Show user's forex/gold trading account (IG Markets). Balance, equity, P&L. Use when user asks about their forex account.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "forex_positions",
      description: "Show user's open forex/gold positions. Use when user asks about their forex positions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "forex_scan",
      description: "Scan all forex pairs and gold for opportunities. Use when user asks 'forex opportunities', 'scan forex', 'oportunidades forex'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ══════════════════════════════════════
// EXECUTION
// ══════════════════════════════════════

export async function executeForexTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const available = await isForexAvailable();
    if (!available) {
      return "El sistema de forex no está disponible ahora. Inténtalo más tarde.";
    }

    switch (toolName) {
      case "forex_analyze": return await doAnalyze(input.instrument as string);
      case "forex_analyze_mtf": return await doAnalyzeMTF(input.instrument as string);
      case "forex_quote": return await doQuote(input.instrument as string);
      case "forex_account": return await doAccount();
      case "forex_positions": return await doPositions();
      case "forex_scan": return await doScan();
      default: return JSON.stringify({ error: `Unknown forex tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`[Forex] ${toolName} error:`, err);
    return JSON.stringify({ error: `Error: ${(err as Error).message}` });
  }
}

// ── Analyze ──

async function doAnalyze(instrument: string): Promise<string> {
  const data = await analyzeForex(instrument, "HOUR", 200);
  if (data.error) return `Error analizando ${instrument}: ${data.error}`;

  const name = formatInstrument(instrument);
  let result = `**📊 Análisis SMC — ${name}**\n\n`;
  result += `**Bias:** ${data.bias === "bullish" ? "🟢 ALCISTA" : data.bias === "bearish" ? "🔴 BAJISTA" : "🟡 NEUTRAL"}\n\n`;

  result += `| Estructura | Cantidad |\n|---|---|\n`;
  result += `| Order Blocks | ${data.order_blocks?.length || 0} |\n`;
  result += `| Fair Value Gaps | ${data.fvgs?.length || 0} |\n`;
  result += `| Break of Structure | ${data.bos?.length || 0} |\n`;
  result += `| Sweeps | ${data.sweeps?.length || 0} |\n`;

  if (data.signal) {
    const sig = data.signal;
    result += `\n**🎯 Señal: ${sig.side === "BUY" ? "🟢 COMPRA" : "🔴 VENTA"}**\n`;
    result += `| Campo | Valor |\n|---|---|\n`;
    result += `| Entrada | ${sig.entry_price} |\n`;
    result += `| Stop Loss | ${sig.stop_loss} |\n`;
    result += `| Take Profit | ${sig.take_profit} |\n`;
    result += `| Confianza | ${sig.confidence}% |\n`;
    result += `| Setup | ${sig.setup_type} |\n`;
  } else {
    result += `\n_No hay señal clara. No operar es también ganar._`;
  }

  return result + DISCLAIMER;
}

// ── Analyze MTF ──

async function doAnalyzeMTF(instrument: string): Promise<string> {
  const data = await analyzeForexMTF(instrument);
  if (data.error) return `Error analizando ${instrument}: ${data.error}`;

  const name = formatInstrument(instrument);
  let result = `**📊 Análisis Multi-Timeframe — ${name}**\n\n`;

  result += `**Weekly Bias:** ${data.mtf_weekly_bias === "bullish" ? "🟢 ALCISTA" : data.mtf_weekly_bias === "bearish" ? "🔴 BAJISTA" : "🟡 NEUTRAL"}\n`;
  result += `**Daily Bias:** ${data.bias === "bullish" ? "🟢 ALCISTA" : data.bias === "bearish" ? "🔴 BAJISTA" : "🟡 NEUTRAL"}\n`;
  result += `**MTF Alineado:** ${data.mtf_aligned ? "✅ SÍ" : "❌ NO"}\n`;

  if (!data.mtf_aligned) {
    result += `\n**Razón:** ${data.mtf_reason}\n`;
    result += `\n_Los timeframes no están alineados. No operar es la mejor decisión._`;
  }

  if (data.signal) {
    const sig = data.signal;
    result += `\n**🎯 Señal MTF: ${sig.side === "BUY" ? "🟢 COMPRA" : "🔴 VENTA"}**\n`;
    result += `| Campo | Valor |\n|---|---|\n`;
    result += `| Entrada | ${sig.entry_price} |\n`;
    result += `| Stop Loss | ${sig.stop_loss} |\n`;
    result += `| Take Profit | ${sig.take_profit} |\n`;
    result += `| Confianza | ${sig.confidence}% |\n`;
    result += `| R:R | 1:${sig.risk_reward_ratio || "2.5"} |\n`;
  }

  return result + DISCLAIMER;
}

// ── Quote ──

async function doQuote(instrument: string): Promise<string> {
  const data = await getForexQuote(instrument);
  if (data.error) return `Error: ${data.error}`;

  const name = formatInstrument(instrument);
  return `**${name}**\nBid: ${data.bid} | Ask: ${data.offer}\nCambio: ${data.change_pct >= 0 ? "+" : ""}${data.change_pct}%\nRango: ${data.low} — ${data.high}\nEstado: ${data.market_status}` + DISCLAIMER;
}

// ── Account ──

async function doAccount(): Promise<string> {
  const data = await getForexAccount();
  if (data.error) return `Error: ${data.error}`;

  let result = `**📊 Cuenta Forex (IG Markets)**\n\n`;
  result += `| Métrica | Valor |\n|---|---|\n`;
  result += `| Balance | €${data.balance?.toLocaleString()} |\n`;
  result += `| Disponible | €${data.available?.toLocaleString()} |\n`;
  result += `| P&L | ${data.profit_loss >= 0 ? "🟢 +" : "🔴 "}€${Math.abs(data.profit_loss || 0).toFixed(2)} |\n`;
  result += `| Depósito/Margen | €${data.deposit?.toFixed(2)} |\n`;

  return result + DISCLAIMER;
}

// ── Positions ──

async function doPositions(): Promise<string> {
  const data = await getForexPositions();
  if (data.error) return `Error: ${data.error}`;

  const positions = data.positions || [];
  if (positions.length === 0) {
    return "No tienes posiciones forex abiertas." + DISCLAIMER;
  }

  let result = `**Posiciones Forex Abiertas (${positions.length})**\n\n`;
  result += `| Par | Dir | Tamaño | Entrada | Actual | P&L |\n|---|---|---|---|---|---|\n`;

  for (const p of positions) {
    const icon = p.direction === "BUY" ? "🟢" : "🔴";
    result += `| ${icon} ${p.instrument_name} | ${p.direction} | ${p.size} | ${p.open_level} | ${p.current_bid} | €${p.profit_loss?.toFixed(2)} |\n`;
  }

  return result + DISCLAIMER;
}

// ── Scan ──

async function doScan(): Promise<string> {
  const instruments = ["EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY", "XAU/USD"];
  let result = `**🔍 Escaneo Forex + Oro**\n\n`;

  for (const inst of instruments) {
    try {
      const quote = await getForexQuote(inst);
      const name = formatInstrument(inst);
      const icon = (quote.change_pct || 0) >= 0 ? "🟢" : "🔴";
      result += `${icon} **${name}**: ${quote.bid} (${quote.change_pct >= 0 ? "+" : ""}${quote.change_pct}%)\n`;
    } catch {
      result += `⚠️ ${inst}: sin datos\n`;
    }
  }

  result += `\nDi "analiza EUR/USD" o "análisis multi-timeframe del oro" para más detalle.`;
  return result + DISCLAIMER;
}
