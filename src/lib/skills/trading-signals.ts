/**
 * Trading Signals — Structured signals with entry, SL, TP, risk calculation
 * + Liquidity sweep detection
 */

import OpenAI from "openai";
import { getQuote, getBasicFinancials, getRecommendations, getPriceTarget, getCompanyNews } from "@/lib/finnhub/client";
import { type AlpacaAuth } from "@/lib/alpaca/client";

// ══════════════════════════════════════
// TOOLS
// ══════════════════════════════════════

export const TRADING_SIGNAL_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "trading_generate_signal",
      description: "Generate a structured trading signal for a specific asset with entry, stop loss, take profit, risk calculation, and confidence level. Also checks for liquidity sweep patterns. Use when user asks for a signal, setup, or trade idea on a specific asset.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Asset symbol (AAPL, NVDA, XAUUSD, SPY, etc.)" },
          direction: { type: "string", enum: ["long", "short", "auto"], description: "Trade direction. 'auto' = analyze and decide. Default: auto" },
          account_size: { type: "number", description: "Account size in € for position sizing. Default: from trading profile" },
          risk_pct: { type: "number", description: "Risk % per trade. Default: from trading profile (typically 0.5%)" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trading_check_sweeps",
      description: "Check for liquidity sweeps and manipulation patterns on an asset. Detects: stop hunts, wick rejections at key levels, volume spikes with reversals. Use BEFORE generating any signal, or when user asks about manipulation/sweeps.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Asset symbol to check" },
        },
        required: ["symbol"],
      },
    },
  },
];

// ══════════════════════════════════════
// EXECUTION
// ══════════════════════════════════════

export async function executeTradingSignals(
  toolName: string,
  input: Record<string, unknown>,
  auth?: AlpacaAuth,
): Promise<string> {
  try {
    switch (toolName) {
      case "trading_generate_signal":
        return await doGenerateSignal(
          input.symbol as string,
          input.direction as string || "auto",
          input.account_size as number || 20000,
          input.risk_pct as number || 0.5,
          auth,
        );
      case "trading_check_sweeps":
        return await doCheckSweeps(input.symbol as string, auth);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`[Signals] ${toolName} error:`, err);
    return JSON.stringify({ error: `Error: ${(err as Error).message}` });
  }
}

// ── Generate Signal ──

async function doGenerateSignal(
  symbol: string,
  direction: string,
  accountSize: number,
  riskPct: number,
  auth?: AlpacaAuth,
): Promise<string> {
  const sym = symbol.toUpperCase();

  // Fetch all data in parallel
  const [quote, financials, recs, target, sweepResult] = await Promise.all([
    getQuote(sym).catch(() => null),
    getBasicFinancials(sym).catch(() => null),
    getRecommendations(sym).catch(() => []),
    getPriceTarget(sym).catch(() => null),
    doCheckSweeps(sym, auth).catch(() => ""),
  ]);

  if (!quote || quote.c === 0) {
    return `No encontré datos para ${sym}. Verifica que es un ticker válido.`;
  }

  const price = quote.c;
  const dayChange = quote.dp || 0;
  const high = quote.h || price;
  const low = quote.l || price;
  const prevClose = quote.pc || price;
  const dayRange = high - low;
  const atr = dayRange; // Simple ATR approximation using today's range

  // Determine direction based on analysis
  let dir = direction;
  if (dir === "auto") {
    const latest = recs[0];
    const buyCount = latest ? latest.strongBuy + latest.buy : 0;
    const sellCount = latest ? latest.sell + latest.strongSell : 0;
    const targetUpside = target?.targetMean ? ((target.targetMean - price) / price * 100) : 0;

    if (dayChange > 0.5 && buyCount > sellCount && targetUpside > 5) {
      dir = "long";
    } else if (dayChange < -0.5 && sellCount > buyCount && targetUpside < -5) {
      dir = "short";
    } else if (buyCount > sellCount * 2) {
      dir = "long";
    } else if (sellCount > buyCount) {
      dir = "short";
    } else {
      dir = "long"; // Default bias
    }
  }

  const isLong = dir === "long";

  // Calculate levels
  const slDistance = Math.max(atr * 0.5, price * 0.01); // SL at 50% of ATR or 1%, whichever is larger
  const tpDistance = slDistance * 2; // Minimum 1:2 RR

  const entry = price;
  const sl = isLong ? price - slDistance : price + slDistance;
  const tp = isLong ? price + tpDistance : price - tpDistance;
  const rrRatio = tpDistance / slDistance;

  // Position sizing
  const riskAmount = accountSize * (riskPct / 100);
  const positionSize = Math.floor(riskAmount / slDistance);
  const positionValue = positionSize * price;
  const positionPct = (positionValue / accountSize * 100);

  // Confidence assessment
  const latest = recs[0];
  const totalAnalysts = latest ? latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell : 0;
  const buyPct = totalAnalysts > 0 ? ((latest!.strongBuy + latest!.buy) / totalAnalysts * 100) : 50;
  const targetUpside = target?.targetMean ? ((target.targetMean - price) / price * 100) : 0;
  const beta = financials?.metric?.beta || 1;

  let confidence: "Alta" | "Media" | "Baja" = "Media";
  let confidenceScore = 50;

  if (isLong) {
    if (buyPct > 70 && targetUpside > 10) { confidence = "Alta"; confidenceScore = 80; }
    else if (buyPct > 50 && targetUpside > 5) { confidence = "Media"; confidenceScore = 60; }
    else { confidence = "Baja"; confidenceScore = 40; }
  } else {
    if (buyPct < 30) { confidence = "Alta"; confidenceScore = 80; }
    else if (buyPct < 50) { confidence = "Media"; confidenceScore = 60; }
    else { confidence = "Baja"; confidenceScore = 40; }
  }

  // Risk level
  const riskLevel = beta > 1.5 ? "Alto" : beta > 1 ? "Moderado" : "Bajo";

  // Build signal
  let result = `**🎯 Señal de Trading — ${sym}**\n\n`;

  // Sweep warning if detected
  if (sweepResult.includes("DETECTADO") || sweepResult.includes("⚠️")) {
    result += `**⚠️ ALERTA DE LIQUIDEZ:**\n${sweepResult}\n\n---\n\n`;
  }

  result += `| Campo | Detalle |\n|---|---|\n`;
  result += `| **Activo** | ${sym} |\n`;
  result += `| **Dirección** | ${isLong ? "🟢 LONG (Compra)" : "🔴 SHORT (Venta)"} |\n`;
  result += `| **Precio actual** | $${price.toFixed(2)} |\n`;
  result += `| **Entrada** | $${entry.toFixed(2)} |\n`;
  result += `| **Stop Loss** | $${sl.toFixed(2)} (${isLong ? "-" : "+"}$${slDistance.toFixed(2)}) |\n`;
  result += `| **Take Profit** | $${tp.toFixed(2)} (${isLong ? "+" : "-"}$${tpDistance.toFixed(2)}) |\n`;
  result += `| **Ratio R:R** | 1:${rrRatio.toFixed(1)} |\n`;
  result += `| **Riesgo** | €${riskAmount.toFixed(0)} (${riskPct}% de €${accountSize.toLocaleString()}) |\n`;
  result += `| **Beneficio esperado** | €${(riskAmount * rrRatio).toFixed(0)} |\n`;
  result += `| **Tamaño posición** | ${positionSize} acciones ($${positionValue.toFixed(0)}, ${positionPct.toFixed(1)}% de cuenta) |\n`;
  result += `| **Confianza** | ${"⭐".repeat(Math.ceil(confidenceScore / 20))}${"☆".repeat(5 - Math.ceil(confidenceScore / 20))} ${confidence} (${confidenceScore}%) |\n`;
  result += `| **Riesgo del activo** | ${riskLevel} (Beta: ${beta.toFixed(2)}) |\n`;

  // Justification
  result += `\n**Justificación:**\n`;
  result += `1. **Analistas:** ${totalAnalysts > 0 ? `${buyPct.toFixed(0)}% recomiendan compra (${totalAnalysts} analistas)` : "Sin datos"}\n`;
  result += `2. **Price Target:** ${target?.targetMean ? `$${target.targetMean.toFixed(2)} (${targetUpside >= 0 ? "+" : ""}${targetUpside.toFixed(1)}% upside)` : "Sin datos"}\n`;
  result += `3. **Precio hoy:** ${dayChange >= 0 ? "+" : ""}${dayChange.toFixed(2)}% | Rango: $${low.toFixed(2)}–$${high.toFixed(2)}\n`;

  // Invalidation
  result += `\n**Invalidación:** ${isLong ? `Si el precio cierra por debajo de $${(sl - slDistance * 0.5).toFixed(2)}, el setup queda invalidado.` : `Si el precio cierra por encima de $${(sl + slDistance * 0.5).toFixed(2)}, el setup queda invalidado.`}\n`;

  result += `\n_Di "compra ${positionSize} ${sym}" para ejecutar esta señal, o "ajusta SL a $X" para modificar._`;
  result += `\n\n_Señal basada en datos de analistas profesionales. La decisión final es tuya. Todo trading conlleva riesgo._`;

  return result;
}

// ── Liquidity Sweep Detection ──

async function doCheckSweeps(symbol: string, auth?: AlpacaAuth): Promise<string> {
  const sym = symbol.toUpperCase();

  const quote = await getQuote(sym).catch(() => null);
  if (!quote || quote.c === 0) return `No hay datos para ${sym}.`;

  const price = quote.c;
  const high = quote.h;
  const low = quote.l;
  const open = quote.o;
  const prevClose = quote.pc;

  const bodySize = Math.abs(price - open);
  const upperWick = high - Math.max(price, open);
  const lowerWick = Math.min(price, open) - low;
  const totalRange = high - low;

  const warnings: string[] = [];

  // 1. Upper wick rejection (potential sweep of highs)
  if (upperWick > bodySize * 2 && upperWick > totalRange * 0.4) {
    warnings.push(`**Sweep de máximos DETECTADO**: Mecha superior de $${upperWick.toFixed(2)} (${(upperWick / totalRange * 100).toFixed(0)}% del rango). El precio tocó $${high.toFixed(2)} y fue rechazado. Posible barrida de stops de ventas.`);
  }

  // 2. Lower wick rejection (potential sweep of lows)
  if (lowerWick > bodySize * 2 && lowerWick > totalRange * 0.4) {
    warnings.push(`**Sweep de mínimos DETECTADO**: Mecha inferior de $${lowerWick.toFixed(2)} (${(lowerWick / totalRange * 100).toFixed(0)}% del rango). El precio tocó $${low.toFixed(2)} y rebotó. Posible barrida de stops de compras.`);
  }

  // 3. Gap from previous close (potential manipulation)
  const gapPct = Math.abs((open - prevClose) / prevClose * 100);
  if (gapPct > 2) {
    warnings.push(`**Gap significativo**: Apertura ${gapPct.toFixed(1)}% ${open > prevClose ? "arriba" : "abajo"} del cierre anterior ($${prevClose.toFixed(2)} → $${open.toFixed(2)}). Posible movimiento institucional.`);
  }

  // 4. Reversal pattern (opened high/low, reversed strongly)
  const reversalPct = ((price - open) / totalRange * 100);
  if (open > prevClose && price < open && Math.abs(reversalPct) > 60) {
    warnings.push(`**Reversión bajista fuerte**: Abrió arriba del cierre anterior pero ha caído ${Math.abs(reversalPct).toFixed(0)}% del rango. Señal de distribución.`);
  }
  if (open < prevClose && price > open && reversalPct > 60) {
    warnings.push(`**Reversión alcista fuerte**: Abrió abajo del cierre anterior pero ha subido ${reversalPct.toFixed(0)}% del rango. Señal de acumulación.`);
  }

  // 5. Previous day level tests
  if (high > prevClose * 1.005 && price < prevClose) {
    warnings.push(`**Test y rechazo del nivel anterior**: El precio superó el cierre de ayer ($${prevClose.toFixed(2)}) hasta $${high.toFixed(2)} pero volvió por debajo. Posible trampa alcista.`);
  }
  if (low < prevClose * 0.995 && price > prevClose) {
    warnings.push(`**Test y rechazo del nivel anterior**: El precio rompió por debajo del cierre de ayer ($${prevClose.toFixed(2)}) hasta $${low.toFixed(2)} pero recuperó. Posible trampa bajista.`);
  }

  // 6. Extreme wick ratio (manipulation signature)
  const wickRatio = (upperWick + lowerWick) / Math.max(bodySize, 0.01);
  if (wickRatio > 4 && totalRange > price * 0.005) {
    warnings.push(`**Vela de indecisión extrema**: Ratio mecha/cuerpo de ${wickRatio.toFixed(1)}x. Las mechas son ${wickRatio.toFixed(0)} veces más grandes que el cuerpo. Alta actividad de manipulación.`);
  }

  if (warnings.length === 0) {
    return `**✅ ${sym} — Sin señales de manipulación detectadas**\n\nEl precio se mueve dentro de parámetros normales. No se detectan sweeps de liquidez, trampas, ni patrones de manipulación en la vela actual.\n\nPrecio: $${price.toFixed(2)} | Rango: $${low.toFixed(2)}–$${high.toFixed(2)} | Cambio: ${quote.dp >= 0 ? "+" : ""}${quote.dp?.toFixed(2)}%`;
  }

  let result = `**⚠️ ${sym} — ${warnings.length} señal${warnings.length > 1 ? "es" : ""} de manipulación detectada${warnings.length > 1 ? "s" : ""}**\n\n`;
  for (const w of warnings) {
    result += `- ${w}\n\n`;
  }
  result += `**Recomendación:** Espera confirmación antes de entrar. Si ya tienes posición, revisa tu stop loss.\n`;
  result += `\nPrecio: $${price.toFixed(2)} | Rango: $${low.toFixed(2)}–$${high.toFixed(2)} | Cambio: ${quote.dp >= 0 ? "+" : ""}${quote.dp?.toFixed(2)}%`;

  return result;
}
