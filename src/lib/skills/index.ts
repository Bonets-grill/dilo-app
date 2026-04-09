import OpenAI from "openai";
import { WEB_SEARCH_TOOLS, executeWebSearch } from "./web-search";
import { GMAIL_TOOLS, executeGmail } from "./gmail";
import { CALENDAR_TOOLS, executeCalendar } from "./google-calendar";
import { TRADING_TOOLS, executeTrading } from "./trading";

// All extended skill tools (added to the base tools in chat route)
export const EXTENDED_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...WEB_SEARCH_TOOLS,
  ...GMAIL_TOOLS,
  ...CALENDAR_TOOLS,
  ...TRADING_TOOLS,
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

  // Trading — need Alpaca OAuth token
  if (toolName.startsWith("trading_")) {
    const { getAlpacaAccessToken } = await import("@/lib/oauth/alpaca");
    const token = await getAlpacaAccessToken(userId);

    if (!token) {
      const oauthUrl = `https://dilo-app-five.vercel.app/api/oauth/alpaca?userId=${userId}`;
      return JSON.stringify({ error: "alpaca_not_connected", message: `El usuario no ha conectado su broker. Dile que haga click aquí para conectar Alpaca: ${oauthUrl}` });
    }

    return executeTrading(toolName, input, token, userId);
  }

  // Not an extended tool — return null so the main executor handles it
  return null;
}
