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
  _userId: string,
  oauthTokens?: { google?: string },
): Promise<string | null> {
  // Web Search
  if (toolName === "web_search") {
    return executeWebSearch(toolName, input);
  }

  // Gmail
  if (toolName.startsWith("gmail_")) {
    return executeGmail(toolName, input, oauthTokens?.google);
  }

  // Google Calendar
  if (toolName.startsWith("calendar_")) {
    return executeCalendar(toolName, input, oauthTokens?.google);
  }

  // Not an extended tool — return null so the main executor handles it
  return null;
}
