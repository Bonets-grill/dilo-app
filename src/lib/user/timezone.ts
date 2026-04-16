import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get the user's IANA timezone. Priority:
 *   1. users.preferences.timezone (explicit user setting, set once at login
 *      via client-side Intl detection, or manually in Settings)
 *   2. Vercel's IP-based geolocation header (fallback if user never loaded
 *      the app or preferences are empty)
 *   3. Europe/Madrid (last-resort default — DILO's largest user base)
 *
 * Returns the timezone string and a human label of local time right now.
 */
export async function getUserTimezone(
  userId: string | null | undefined,
  headerTimezone: string | null
): Promise<{ timezone: string; localTimeLabel: string; nowIso: string }> {
  let timezone: string | null = null;

  if (userId) {
    try {
      const { data } = await supabase
        .from("users")
        .select("preferences")
        .eq("id", userId)
        .single();
      const prefs = (data?.preferences as Record<string, unknown>) || {};
      const tz = prefs.timezone;
      if (typeof tz === "string" && tz.length > 0) timezone = tz;
    } catch { /* ignore */ }
  }

  if (!timezone && headerTimezone) timezone = headerTimezone;
  if (!timezone) timezone = "Europe/Madrid";

  // Validate — if invalid for any reason, fall back silently
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    timezone = "Europe/Madrid";
  }

  const now = new Date();
  const localTimeLabel = now.toLocaleString("sv-SE", { timeZone: timezone });
  return { timezone, localTimeLabel, nowIso: now.toISOString() };
}
