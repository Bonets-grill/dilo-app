import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const TRIP_PLANNER_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "productivity_plan_trip",
      description: "Plan a trip with itinerary, budget, hotels, restaurants, and activities. Use when user says things like 'plan my trip to...', 'voy a viajar a...', 'organiza un viaje a...'",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string", description: "City or country to visit" },
          days: { type: "number", description: "Number of days for the trip" },
          budget: { type: "string", description: "Budget level: low, medium, high" },
          interests: { type: "string", description: "Comma-separated interests: culture, food, nature, nightlife, shopping, adventure" },
          travelers: { type: "number", description: "Number of travelers" },
        },
        required: ["destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "productivity_schedule",
      description: "Create a weekly or daily schedule plan with priorities. Use when user says 'organiza mi semana', 'plan my week', 'haz un horario', 'schedule my day'",
      parameters: {
        type: "object",
        properties: {
          tasks: { type: "string", description: "Comma-separated list of tasks to schedule" },
          period: { type: "string", enum: ["day", "week"], description: "Plan for a day or full week" },
          wake_time: { type: "string", description: "Wake up time, e.g. '07:00'" },
          sleep_time: { type: "string", description: "Sleep time, e.g. '23:00'" },
          language: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "Language for the schedule output" },
        },
        required: ["tasks"],
      },
    },
  },
];

export async function executeTripPlannerTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    if (toolName === "productivity_plan_trip") {
      const { destination, days = 3, budget = "medium", interests = "culture, food", travelers = 1 } = input as {
        destination: string; days?: number; budget?: string; interests?: string; travelers?: number;
      };

      const prompt = `Create a detailed ${days}-day trip plan to ${destination}.
Budget level: ${budget}
Interests: ${interests}
Travelers: ${travelers}

For each day provide:
1. Morning activity with estimated cost
2. Lunch spot (local recommendation) with estimated cost
3. Afternoon activity with estimated cost
4. Dinner spot with estimated cost
5. Optional evening activity

Also include:
- Total estimated budget breakdown (accommodation, food, transport, activities)
- 3 hotel recommendations (budget, mid-range, luxury) with price ranges
- Top 5 local tips
- Best transport options from airport
- Emergency numbers

Format as structured JSON with keys: days[], hotels[], tips[], transport, emergency, totalBudget.
Each day has: dayNumber, morning{activity,cost}, lunch{place,cost}, afternoon{activity,cost}, dinner{place,cost}, evening{activity,cost}.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are a travel expert. Return valid JSON only. All costs in EUR." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const plan = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, trip: JSON.parse(plan) });
    }

    if (toolName === "productivity_schedule") {
      const { tasks, period = "day", wake_time = "08:00", sleep_time = "23:00", language = "es" } = input as {
        tasks: string; period?: string; wake_time?: string; sleep_time?: string; language?: string;
      };

      const langName: Record<string, string> = { es: "español", en: "English", fr: "français", it: "italiano", de: "Deutsch" };
      const dayNames: Record<string, Record<string, string>> = {
        es: { monday: "lunes", tuesday: "martes", wednesday: "miércoles", thursday: "jueves", friday: "viernes", saturday: "sábado", sunday: "domingo" },
        en: { monday: "monday", tuesday: "tuesday", wednesday: "wednesday", thursday: "thursday", friday: "friday", saturday: "saturday", sunday: "sunday" },
        fr: { monday: "lundi", tuesday: "mardi", wednesday: "mercredi", thursday: "jeudi", friday: "vendredi", saturday: "samedi", sunday: "dimanche" },
        it: { monday: "lunedì", tuesday: "martedì", wednesday: "mercoledì", thursday: "giovedì", friday: "venerdì", saturday: "sabato", sunday: "domenica" },
        de: { monday: "Montag", tuesday: "Dienstag", wednesday: "Mittwoch", thursday: "Donnerstag", friday: "Freitag", saturday: "Samstag", sunday: "Sonntag" },
      };
      const days = dayNames[language] || dayNames.es;

      const prompt = `Create an optimized ${period} schedule.
Available hours: ${wake_time} to ${sleep_time}
Tasks to schedule: ${tasks}
CRITICAL: ALL text output (task names, tips, day names) MUST be in ${langName[language] || "español"}. Use these day names: ${Object.values(days).join(", ")}.

Rules:
- Most demanding tasks in the morning (peak energy)
- Include breaks every 90 minutes
- Include meal times (breakfast 8:00, lunch 13:00, dinner 20:00)
- Group similar tasks together
- Add buffer time between tasks
- Weekend days should have lighter schedules

Return JSON. For a week schedule use this EXACT structure:
{
  "schedule": {
    "monday": [{"time": "08:00", "task": "task name", "duration_min": 60}],
    "tuesday": [...],
    "wednesday": [...],
    "thursday": [...],
    "friday": [...],
    "saturday": [...],
    "sunday": [{"time": "all day", "task": "Rest & recovery", "duration_min": 0}]
  },
  "tips": ["productivity tip 1", "tip 2"]
}
For a day schedule: {"schedule": [{"time": "08:00", "task": "task", "duration_min": 60}], "tips": [...]}
Keep each day to max 8 entries to stay concise.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are a productivity expert. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const schedule = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, ...JSON.parse(schedule) });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    return JSON.stringify({ error: `Trip planner error: ${(err as Error).message}` });
  }
}
