import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const APPOINTMENT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "appointment_create",
      description:
        "Create a personal appointment/event stored in DILO (not Google Calendar). Use whenever the user mentions a scheduled event, meeting, medical visit, class, etc.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short event title, e.g. 'Cita dentista de Sebas'" },
          start_at: { type: "string", description: "Start datetime ISO 8601 with timezone" },
          end_at: { type: "string", description: "End datetime ISO 8601 (optional, defaults to +1h)" },
          location: { type: "string", description: "Optional address or place" },
          notes: { type: "string", description: "Optional free-text details" },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of attendee names",
          },
        },
        required: ["title", "start_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "appointment_list",
      description:
        "List the user's upcoming appointments stored in DILO. Use when the user asks about their schedule, citas, eventos, plans.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "ISO 8601 lower bound (default: now)" },
          to: { type: "string", description: "ISO 8601 upper bound (default: now+30d)" },
          query: { type: "string", description: "Optional substring filter on title/notes" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "appointment_cancel",
      description: "Cancel an appointment by id. Marks it as cancelled; does not delete the row.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "Appointment id (UUID)" } },
        required: ["id"],
      },
    },
  },
];

interface AppointmentInput {
  title?: string;
  start_at?: string;
  end_at?: string;
  location?: string;
  notes?: string;
  attendees?: string[];
  from?: string;
  to?: string;
  query?: string;
  id?: string;
}

export async function executeAppointmentTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  const i = input as AppointmentInput;

  if (toolName === "appointment_create") {
    if (!i.title || !i.start_at) {
      return JSON.stringify({ error: "title and start_at are required" });
    }
    const start = new Date(i.start_at);
    if (isNaN(start.getTime())) return JSON.stringify({ error: "invalid start_at" });
    const end = i.end_at ? new Date(i.end_at) : new Date(start.getTime() + 60 * 60 * 1000);

    const attendeesClean = Array.isArray(i.attendees)
      ? i.attendees.filter((s) => typeof s === "string").slice(0, 20)
      : [];

    const { data, error } = await admin
      .from("appointments")
      .insert({
        user_id: userId,
        title: i.title.slice(0, 200),
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        location: i.location?.slice(0, 300) || null,
        notes: i.notes?.slice(0, 2000) || null,
        attendees: attendeesClean,
      })
      .select("id, title, start_at, end_at, location, notes, attendees")
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ ok: true, appointment: data });
  }

  if (toolName === "appointment_list") {
    const from = i.from ? new Date(i.from) : new Date();
    const to = i.to ? new Date(i.to) : new Date(Date.now() + 30 * 86400000);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return JSON.stringify({ error: "invalid date range" });
    }
    let q = admin
      .from("appointments")
      .select("id, title, start_at, end_at, location, notes, attendees, status")
      .eq("user_id", userId)
      .gte("start_at", from.toISOString())
      .lte("start_at", to.toISOString())
      .neq("status", "cancelled")
      .order("start_at", { ascending: true })
      .limit(50);

    if (i.query && typeof i.query === "string" && i.query.trim().length > 0) {
      const like = `%${i.query.trim()}%`;
      q = q.or(`title.ilike.${like},notes.ilike.${like}`);
    }

    const { data, error } = await q;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ count: data?.length || 0, appointments: data || [] });
  }

  if (toolName === "appointment_cancel") {
    if (!i.id) return JSON.stringify({ error: "id required" });
    const { data, error } = await admin
      .from("appointments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", i.id)
      .eq("user_id", userId)
      .select("id, title, status")
      .single();
    if (error) return JSON.stringify({ error: error.message });
    if (!data) return JSON.stringify({ error: "appointment_not_found" });
    return JSON.stringify({ ok: true, appointment: data });
  }

  return JSON.stringify({ error: "unknown appointment tool" });
}
