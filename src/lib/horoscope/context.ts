/**
 * Extra personal context for the daily horoscope prompt.
 *
 * Returns a small array of "facts" pulled from external channels:
 *   - Gmail: up to 3 most recent unread subjects + snippets (if user has
 *     Google OAuth connected).
 *   - WhatsApp: up to 5 most recent inbound messages from whatsapp_tracking.
 *
 * These are merged with memory_facts before being handed to generateHoroscope,
 * so the prompt can personalise the reading with what's actually going on in
 * the user's life right now — not just their long-term profile.
 *
 * Budget: hard-capped at ~10 snippets total, each ≤140 chars. Worst-case adds
 * ~1.5 KB to the prompt, well inside GPT-4o-mini's window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAccessToken } from "@/lib/oauth/google";
import { computeNatalChart } from "./natal";
import { geocodeCity } from "./geocode";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type Fact = { fact: string; category: string };

function truncate(s: string, n = 140): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

async function fetchRecentGmail(userId: string): Promise<Fact[]> {
  try {
    const token = await getGoogleAccessToken(userId);
    if (!token) return [];
    const params = new URLSearchParams({ maxResults: "3", q: "newer_than:2d -in:promotions -in:social" });
    const list = await fetch(`${GMAIL_API}/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!list.ok) return [];
    const listData = await list.json() as { messages?: Array<{ id: string }> };
    const ids = (listData.messages || []).map(m => m.id).slice(0, 3);
    const details = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(
          `${GMAIL_API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) return null;
        const d = await r.json() as {
          snippet?: string;
          payload?: { headers?: Array<{ name: string; value: string }> };
        };
        const from = d.payload?.headers?.find(h => h.name.toLowerCase() === "from")?.value || "";
        const subject = d.payload?.headers?.find(h => h.name.toLowerCase() === "subject")?.value || "";
        const sender = from.split("<")[0].trim() || from;
        return { fact: truncate(`Email de ${sender}: ${subject} — ${d.snippet || ""}`), category: "gmail" } as Fact;
      })
    );
    return details.filter((x): x is Fact => x !== null);
  } catch (err) {
    console.warn("[horoscope.context] gmail fetch failed", err);
    return [];
  }
}

async function fetchRecentWhatsApp(admin: SupabaseClient, userId: string): Promise<Fact[]> {
  try {
    const { data } = await admin
      .from("whatsapp_tracking")
      .select("contact_name, phone, message_preview, direction, created_at")
      .eq("user_id", userId)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(5);
    if (!data || data.length === 0) return [];
    return data
      .filter((row): row is { contact_name: string | null; phone: string; message_preview: string | null; direction: string; created_at: string } =>
        typeof row === "object" && row !== null)
      .map((row) => {
        const who = row.contact_name || row.phone || "un contacto";
        const msg = row.message_preview || "(sin texto)";
        return { fact: truncate(`WhatsApp de ${who}: ${msg}`), category: "whatsapp" };
      });
  } catch (err) {
    console.warn("[horoscope.context] whatsapp fetch failed", err);
    return [];
  }
}

const SIGN_LABELS: Record<string, string> = {
  aries: "Aries", taurus: "Tauro", gemini: "Géminis", cancer: "Cáncer",
  leo: "Leo", virgo: "Virgo", libra: "Libra", scorpio: "Escorpio",
  sagittarius: "Sagitario", capricorn: "Capricornio", aquarius: "Acuario", pisces: "Piscis",
};

async function fetchNatalContext(admin: SupabaseClient, userId: string): Promise<Fact[]> {
  try {
    const { data: user } = await admin
      .from("users")
      .select("birthdate, birth_time, birth_place")
      .eq("id", userId)
      .maybeSingle();
    if (!user?.birthdate) return [];
    const row = user as { birthdate: string; birth_time: string | null; birth_place: string | null };
    let lat: number | null = null;
    let lon: number | null = null;
    if (row.birth_place) {
      const geo = await geocodeCity(row.birth_place);
      if (geo) { lat = geo.latitude; lon = geo.longitude; }
    }
    const chart = computeNatalChart({
      birthdateIso: row.birthdate,
      birthTime: row.birth_time,
      latitude: lat,
      longitude: lon,
    });
    const facts: Fact[] = [
      { fact: `Luna natal en ${SIGN_LABELS[chart.moon] || chart.moon}`, category: "natal" },
    ];
    if (chart.ascendant) {
      facts.push({ fact: `Ascendente en ${SIGN_LABELS[chart.ascendant] || chart.ascendant}`, category: "natal" });
    }
    return facts;
  } catch (err) {
    console.warn("[horoscope.context] natal chart failed", err);
    return [];
  }
}

/** Fetch Gmail + WhatsApp + natal chart in parallel. Safe on failure — returns []. */
export async function fetchExternalContext(
  admin: SupabaseClient,
  userId: string
): Promise<Fact[]> {
  const [gmail, wa, natal] = await Promise.all([
    fetchRecentGmail(userId),
    fetchRecentWhatsApp(admin, userId),
    fetchNatalContext(admin, userId),
  ]);
  // natal first so the prompt anchors on Moon/Rising before current events
  return [...natal, ...gmail, ...wa].slice(0, 12);
}
