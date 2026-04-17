import OpenAI from "openai";
import { WEB_SEARCH_TOOLS, executeWebSearch } from "./web-search";
import { WEB_SCRAPE_TOOLS, executeWebScrape } from "./web-scrape";
import { BROWSER_TOOLS, executeBrowser } from "./browser";
import { GMAIL_TOOLS, executeGmail } from "./gmail";
import { CALENDAR_TOOLS, executeCalendar } from "./google-calendar";
import { NUTRITION_TOOLS, executeNutritionTool } from "./nutrition";
import { WELLNESS_TOOLS, executeWellnessTool } from "./wellness";
import { KNOWLEDGE_TOOLS, executeKnowledgeTool } from "./knowledge";
import { ENTERTAINMENT_TOOLS, executeEntertainmentTool } from "./entertainment";
import { TRIP_PLANNER_TOOLS, executeTripPlannerTool } from "./trip-planner";
import { DECISION_HELPER_TOOLS, executeDecisionHelperTool } from "./decision-helper";
import { EMAIL_WRITER_TOOLS, executeEmailWriterTool } from "./email-writer";
import { RESUME_BUILDER_TOOLS, executeResumeBuilderTool } from "./resume-builder";
import { BUSINESS_ADVISOR_TOOLS, executeBusinessAdvisorTool } from "./business-advisor";
import { APPOINTMENT_TOOLS, executeAppointmentTool } from "./appointments";

// Base extended tools (always available)
export const EXTENDED_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...WEB_SEARCH_TOOLS,
  ...WEB_SCRAPE_TOOLS,
  ...BROWSER_TOOLS,
  ...GMAIL_TOOLS,
  ...CALENDAR_TOOLS,
  ...NUTRITION_TOOLS,
  ...WELLNESS_TOOLS,
  ...TRIP_PLANNER_TOOLS,
  ...DECISION_HELPER_TOOLS,
  ...EMAIL_WRITER_TOOLS,
  ...RESUME_BUILDER_TOOLS,
  ...BUSINESS_ADVISOR_TOOLS,
  ...APPOINTMENT_TOOLS,
];

// Knowledge tools (always available)
export { KNOWLEDGE_TOOLS };

// Entertainment tools (always available)
export { ENTERTAINMENT_TOOLS };

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

  // Web Scrape (Firecrawl)
  if (toolName === "web_scrape" || toolName === "web_extract") {
    return executeWebScrape(toolName, input);
  }

  // Browser automation (Stagehand + Browserbase)
  if (toolName.startsWith("browser_")) {
    return executeBrowser(toolName, input);
  }

  // Gmail or Calendar — need Google OAuth token
  if (toolName.startsWith("gmail_") || toolName.startsWith("calendar_")) {
    const { getGoogleAccessToken } = await import("@/lib/oauth/google");
    const token = await getGoogleAccessToken(userId);

    if (!token) {
      // Si es un calendar tool sin Google, delegamos al tool interno de
      // DILO (appointment_create / appointment_list) para que el LLM no
      // bloquee al usuario pidiendo conectar Google.
      if (toolName === "calendar_create_event") {
        return executeAppointmentTool("appointment_create", {
          title: (input as { summary?: string }).summary,
          start_at: (input as { start?: string }).start,
          end_at: (input as { end?: string }).end,
          location: (input as { location?: string }).location,
          notes: (input as { description?: string }).description,
        }, userId);
      }
      if (toolName === "calendar_list_events") {
        return executeAppointmentTool("appointment_list", {
          from: (input as { time_min?: string }).time_min,
          to: (input as { time_max?: string }).time_max,
        }, userId);
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ordydilo.com";
      const oauthUrl = `${appUrl}/api/oauth/google?userId=${userId}`;
      return JSON.stringify({
        error: "google_not_connected",
        message: `El usuario no tiene Google conectado. Para ${toolName.startsWith("gmail_") ? "Gmail usa sus tools cuando conecte Google" : "citas/recordatorios usa appointment_create o create_reminder en su lugar"}. Link para conectar Google: ${oauthUrl}`,
      });
    }

    if (toolName.startsWith("gmail_")) {
      return executeGmail(toolName, input, token);
    }
    return executeCalendar(toolName, input, token);
  }

  // Nutrition tools (always available)
  if (toolName.startsWith("nutrition_")) {
    return executeNutritionTool(toolName, input, userId);
  }

  // Wellness tools (always available)
  if (toolName.startsWith("wellness_")) {
    return executeWellnessTool(toolName, input, userId);
  }

  // Knowledge tools (always available)
  if (toolName.startsWith("knowledge_")) {
    return executeKnowledgeTool(toolName, input);
  }

  // Entertainment tools (always available)
  if (toolName.startsWith("entertainment_")) {
    return executeEntertainmentTool(toolName, input);
  }

  // Productivity tools (trip planner, schedule)
  if (toolName.startsWith("productivity_")) {
    if (toolName === "productivity_plan_trip" || toolName === "productivity_schedule") {
      return executeTripPlannerTool(toolName, input);
    }
    return executeDecisionHelperTool(toolName, input);
  }

  // Writing tools (emails, messages, copy, style)
  if (toolName.startsWith("writing_")) {
    return executeEmailWriterTool(toolName, input);
  }

  // Career tools (resume, interview, salary, pitfalls)
  if (toolName.startsWith("career_")) {
    return executeResumeBuilderTool(toolName, input);
  }

  // Business tools (model, competitors, pricing, SEO, social, earn)
  if (toolName.startsWith("business_")) {
    return executeBusinessAdvisorTool(toolName, input);
  }

  // Appointments (internal, Supabase-backed alternative to Google Calendar)
  if (toolName.startsWith("appointment_")) {
    return executeAppointmentTool(toolName, input, userId);
  }

  // Not an extended tool — return null so the main executor handles it
  return null;
}
