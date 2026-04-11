import OpenAI from "openai";
import { WEB_SEARCH_TOOLS, executeWebSearch } from "./web-search";
import { GMAIL_TOOLS, executeGmail } from "./gmail";
import { CALENDAR_TOOLS, executeCalendar } from "./google-calendar";
import { TRADING_TOOLS, executeTrading } from "./trading";
import { MARKET_ANALYSIS_TOOLS, executeMarketAnalysis } from "./market-analysis";
import { TRADING_CALENDAR_TOOLS, executeTradingCalendar } from "./trading-calendar";
import { TRADING_SIGNAL_TOOLS, executeTradingSignals } from "./trading-signals";
import { FOREX_TOOLS, executeForexTool } from "./trading-forex";
import { NUTRITION_TOOLS, executeNutritionTool } from "./nutrition";
import { WELLNESS_TOOLS, executeWellnessTool } from "./wellness";
import { TRADING_MEMORY_TOOLS, executeTradingMemoryTool } from "./trading-memory";
import { KNOWLEDGE_TOOLS, executeKnowledgeTool } from "./knowledge";
import { ENTERTAINMENT_TOOLS, executeEntertainmentTool } from "./entertainment";
import { TRADING_EMOTIONAL_TOOLS, executeTradingEmotionalTool } from "./trading-emotional";

// Base extended tools (always available)
export const EXTENDED_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...WEB_SEARCH_TOOLS,
  ...GMAIL_TOOLS,
  ...CALENDAR_TOOLS,
  ...NUTRITION_TOOLS,
  ...WELLNESS_TOOLS,
];

// Trading tools (only for users with Alpaca connected)
export { TRADING_TOOLS };

// Forex tools (independent of Alpaca — uses IG Markets)
export { FOREX_TOOLS };

// Trading memory tools (always available with trading)
export { TRADING_MEMORY_TOOLS };

// Knowledge tools (always available)
export { KNOWLEDGE_TOOLS };

// Entertainment tools (always available)
export { ENTERTAINMENT_TOOLS };

// Trading emotional tools (always available with trading)
export { TRADING_EMOTIONAL_TOOLS };

// Stock trading tools (Alpaca connected)
export const ALL_TRADING_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...TRADING_TOOLS,
  ...MARKET_ANALYSIS_TOOLS,
  ...TRADING_CALENDAR_TOOLS,
  ...TRADING_SIGNAL_TOOLS,
];

// All trading tools including forex (for users with both)
export const ALL_TRADING_AND_FOREX_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...ALL_TRADING_TOOLS,
  ...FOREX_TOOLS,
];

// Route tool execution to the right skill handler
export async function executeExtendedTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string | null> {
  // Web Search
  if (toolName === "web_search") {
    return executeWebSearch(toolName, input);
  }

  // Gmail or Calendar — need Google OAuth token
  if (toolName.startsWith("gmail_") || toolName.startsWith("calendar_")) {
    const { getGoogleAccessToken } = await import("@/lib/oauth/google");
    const token = await getGoogleAccessToken(userId);

    if (!token) {
      const oauthUrl = `https://dilo-app-five.vercel.app/api/oauth/google?userId=${userId}`;
      return JSON.stringify({ error: "google_not_connected", message: `El usuario no ha conectado su cuenta de Google. Dile que haga click aquí para conectar: ${oauthUrl}` });
    }

    if (toolName.startsWith("gmail_")) {
      return executeGmail(toolName, input, token);
    }
    return executeCalendar(toolName, input, token);
  }

  // Market Analysis — Finnhub data
  // Intercept: if LLM sends a forex/gold symbol to stock tools, redirect to forex_analyze
  if (toolName === "market_analyze_stock") {
    const sym = ((input.symbol as string) || "").toUpperCase().replace(/\s+/g, "");
    const FOREX_MAP: Record<string, string> = {
      "XAU": "XAU/USD", "XAUUSD": "XAU/USD", "XAU/USD": "XAU/USD", "GOLD": "XAU/USD", "ORO": "XAU/USD",
      "ORODOLAR": "XAU/USD", "ORODÓLAR": "XAU/USD", "ORODOLLAR": "XAU/USD",
      "EURO": "EUR/USD", "EUR": "EUR/USD", "EURUSD": "EUR/USD", "EUR/USD": "EUR/USD", "EURODOLAR": "EUR/USD",
      "LIBRA": "GBP/USD", "GBP": "GBP/USD", "GBPUSD": "GBP/USD", "GBP/USD": "GBP/USD",
      "YEN": "USD/JPY", "JPY": "USD/JPY", "USDJPY": "USD/JPY", "USD/JPY": "USD/JPY",
      "GBPJPY": "GBP/JPY", "GBP/JPY": "GBP/JPY",
      "EURGBP": "EUR/GBP", "EUR/GBP": "EUR/GBP", "EURJPY": "EUR/JPY", "EUR/JPY": "EUR/JPY",
    };
    const fxInstrument = FOREX_MAP[sym];
    if (fxInstrument) {
      console.log(`[Tool Router] Redirecting market_analyze_stock(${sym}) → forex_analyze(${fxInstrument})`);
      return executeForexTool("forex_analyze", { instrument: fxInstrument });
    }
  }
  if (toolName.startsWith("market_")) {
    return executeMarketAnalysis(toolName, input);
  }

  // Trading Calendar
  if (toolName === "trading_calendar") {
    return executeTradingCalendar(toolName, input, userId);
  }

  // Trading Signals & Liquidity Sweeps
  if (toolName === "trading_generate_signal" || toolName === "trading_check_sweeps") {
    const { getAlpacaKeys } = await import("@/lib/oauth/alpaca");
    const keys = await getAlpacaKeys(userId);
    return executeTradingSignals(toolName, input, keys || undefined);
  }

  // Trading — need Alpaca API keys
  if (toolName.startsWith("trading_")) {
    const { getAlpacaKeys } = await import("@/lib/oauth/alpaca");
    const keys = await getAlpacaKeys(userId);

    if (!keys) {
      return JSON.stringify({ error: "alpaca_not_connected", message: "El usuario no ha configurado sus API keys de Alpaca. Dile que vaya a su Perfil en DILO y pegue sus API keys de Alpaca (las obtiene gratis en alpaca.markets → API)." });
    }

    return executeTrading(toolName, input, keys, userId);
  }

  // Forex tools (IG Markets)
  if (toolName.startsWith("forex_")) {
    return executeForexTool(toolName, input);
  }

  // Nutrition tools (always available)
  if (toolName.startsWith("nutrition_")) {
    return executeNutritionTool(toolName, input, userId);
  }

  // Wellness tools (always available)
  if (toolName.startsWith("wellness_")) {
    return executeWellnessTool(toolName, input, userId);
  }

  // Trading memory tools
  if (toolName === "trading_memory" || toolName === "trading_insights") {
    return executeTradingMemoryTool(toolName, input);
  }

  // Knowledge tools (always available)
  if (toolName.startsWith("knowledge_")) {
    return executeKnowledgeTool(toolName, input);
  }

  // Entertainment tools (always available)
  if (toolName.startsWith("entertainment_")) {
    return executeEntertainmentTool(toolName, input);
  }

  // Trading emotional tools
  if (toolName === "trading_emotional_status" || toolName === "trading_weekly_report" || toolName === "trading_correlations" || toolName === "trading_kill_zone_status") {
    return executeTradingEmotionalTool(toolName, input, userId);
  }

  // Not an extended tool — return null so the main executor handles it
  return null;
}
