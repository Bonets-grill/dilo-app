import OpenAI from "openai";

export const CALENDAR_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "calendar_list_events",
      description: "List upcoming events from the user's Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          max_results: { type: "number", description: "Max events (default: 10)" },
          time_min: { type: "string", description: "Start filter ISO 8601 (default: now)" },
          time_max: { type: "string", description: "End filter ISO 8601 (default: 7 days)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_create_event",
      description: "Create a new event on the user's Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Event title" },
          start: { type: "string", description: "Start time ISO 8601" },
          end: { type: "string", description: "End time ISO 8601" },
          description: { type: "string", description: "Optional description" },
          location: { type: "string", description: "Optional location" },
        },
        required: ["summary", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_find_free_time",
      description: "Find available time slots in the user's calendar.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date YYYY-MM-DD" },
          duration_minutes: { type: "number", description: "Meeting duration in minutes (default: 30)" },
        },
        required: ["date"],
      },
    },
  },
];

const CAL_API = "https://www.googleapis.com/calendar/v3/calendars/primary";

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
}

async function calFetch(token: string, path: string, init?: RequestInit) {
  const resp = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await resp.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: resp.ok, status: resp.status, json, text };
}

export async function executeCalendar(toolName: string, input: Record<string, unknown>, oauthToken?: string): Promise<string> {
  if (!oauthToken) return JSON.stringify({ error: "Google Calendar no conectado. Conecta tu cuenta de Google en Ajustes." });

  try {
    switch (toolName) {
      case "calendar_list_events": {
        const maxResults = (input.max_results as number) || 10;
        const timeMin = (input.time_min as string) || new Date().toISOString();
        const timeMax = (input.time_max as string) || new Date(Date.now() + 7 * 86400000).toISOString();
        const params = new URLSearchParams({
          maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
          timeMin, timeMax, singleEvents: "true", orderBy: "startTime",
        });
        const res = await calFetch(oauthToken, `/events?${params.toString()}`);
        if (!res.ok) return JSON.stringify({ error: `Calendar error (${res.status})` });
        const events = ((res.json as { items?: CalendarEvent[] })?.items ?? []).map(e => ({
          id: e.id, summary: e.summary ?? "", start: e.start?.dateTime ?? e.start?.date ?? "",
          end: e.end?.dateTime ?? e.end?.date ?? "", location: e.location ?? "", link: e.htmlLink ?? "",
        }));
        return JSON.stringify({ count: events.length, events });
      }

      case "calendar_create_event": {
        const { summary, start, end, description, location } = input as {
          summary: string; start: string; end: string; description?: string; location?: string;
        };
        if (!summary || !start || !end) return JSON.stringify({ error: "Faltan: summary, start, end" });
        const res = await calFetch(oauthToken, "/events", {
          method: "POST",
          body: JSON.stringify({ summary, description, location, start: { dateTime: start }, end: { dateTime: end } }),
        });
        if (!res.ok) return JSON.stringify({ error: `Calendar create error (${res.status})` });
        const created = res.json as CalendarEvent;
        return JSON.stringify({ created: true, id: created.id, summary: created.summary, start: created.start?.dateTime, link: created.htmlLink });
      }

      case "calendar_find_free_time": {
        const date = input.date as string;
        if (!date) return JSON.stringify({ error: "Falta: date" });
        const durationMs = ((input.duration_minutes as number) || 30) * 60000;
        const dayStart = new Date(`${date}T00:00:00Z`).toISOString();
        const dayEnd = new Date(`${date}T23:59:59Z`).toISOString();
        const res = await calFetch(oauthToken, `/events?${new URLSearchParams({ timeMin: dayStart, timeMax: dayEnd, singleEvents: "true", orderBy: "startTime" })}`);
        if (!res.ok) return JSON.stringify({ error: `Calendar error (${res.status})` });
        const busy = ((res.json as { items?: CalendarEvent[] })?.items ?? [])
          .map(e => ({ start: new Date(e.start?.dateTime ?? e.start?.date ?? 0).getTime(), end: new Date(e.end?.dateTime ?? e.end?.date ?? 0).getTime() }))
          .filter(s => s.start && s.end).sort((a, b) => a.start - b.start);
        const workStart = new Date(`${date}T09:00:00Z`).getTime();
        const workEnd = new Date(`${date}T18:00:00Z`).getTime();
        const freeSlots: Array<{ start: string; end: string }> = [];
        let cursor = workStart;
        for (const b of busy) {
          if (b.end <= workStart || b.start >= workEnd) continue;
          if (b.start - cursor >= durationMs) freeSlots.push({ start: new Date(cursor).toISOString(), end: new Date(b.start).toISOString() });
          cursor = Math.max(cursor, b.end);
        }
        if (workEnd - cursor >= durationMs) freeSlots.push({ start: new Date(cursor).toISOString(), end: new Date(workEnd).toISOString() });
        return JSON.stringify({ date, duration_minutes: (input.duration_minutes as number) || 30, free_slots: freeSlots });
      }

      default:
        return JSON.stringify({ error: `Unknown Calendar tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({ error: `Calendar error: ${err instanceof Error ? err.message : String(err)}` });
  }
}
