import OpenAI from "openai";
import { WEB_SEARCH_TOOLS, executeWebSearch } from "./web-search";
import { GMAIL_TOOLS, executeGmail } from "./gmail";
import { CALENDAR_TOOLS, executeCalendar } from "./google-calendar";

// All extended skill tools (added to the base tools in chat route)
export const EXTENDED_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...WEB_SEARCH_TOOLS,
  ...GMAIL_TOOLS,
  ...CALENDAR_TOOLS,
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

  // Not an extended tool — return null so the main executor handles it
  return null;
}
