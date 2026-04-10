import OpenAI from "openai";
import { WEB_SEARCH_TOOLS, executeWebSearch } from "./web-search";
import { GMAIL_TOOLS, executeGmail } from "./gmail";
import { CALENDAR_TOOLS, executeCalendar } from "./google-calendar";
import { TRADING_TOOLS, executeTrading } from "./trading";
import { MARKET_ANALYSIS_TOOLS, executeMarketAnalysis } from "./market-analysis";
import { TRADING_CALENDAR_TOOLS, executeTradingCalendar } from "./trading-calendar";
import { TRADING_SIGNAL_TOOLS, executeTradingSignals } from "./trading-signals";
import { FOREX_TOOLS, executeForexTool } from "./trading-forex";

// Base extended tools (always available)
export const EXTENDED_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...WEB_SEARCH_TOOLS,
  ...GMAIL_TOOLS,
  ...CALENDAR_TOOLS,
];

// Trading tools (only for users with Alpaca connected)
export { TRADING_TOOLS };

// Market analysis + calendar + signals (for users with Alpaca connected)
export const ALL_TRADING_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...TRADING_TOOLS,
  ...MARKET_ANALYSIS_TOOLS,
  ...TRADING_CALENDAR_TOOLS,
  ...TRADING_SIGNAL_TOOLS,
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

  // Not an extended tool — return null so the main executor handles it
  return null;
}
