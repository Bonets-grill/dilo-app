import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATEGORIES = [
  "identity", "routine", "preferences", "relationships",
  "work", "finance", "health", "dates", "general",
] as const;

type FactCategory = typeof CATEGORIES[number];

interface ExtractedFact {
  category: FactCategory;
  fact: string;
  source: "explicit" | "inferred";
}

/**
 * Extract personal facts from a conversation exchange.
 * Runs AFTER the chat response, non-blocking (fire-and-forget).
 * Uses ~100 tokens per call = ~$0.00006 per extraction.
 */
export async function extractFacts(
  userId: string,
  userMessage: string,
  assistantResponse: string,
): Promise<void> {
  // Skip very short messages or system-generated content
  if (userMessage.length < 10) return;
  if (userMessage.startsWith("[Foto") || userMessage.startsWith("__IMAGE__")) return;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You extract personal facts from conversations. Output ONLY a JSON array of facts. Each fact is an object with:
- "category": one of ${CATEGORIES.join(", ")}
- "fact": a short sentence about the user (in Spanish)
- "source": "explicit" if the user stated it directly, "inferred" if you deduced it

Rules:
- Only extract PERSONAL facts about the user (name, habits, preferences, dates, people, work, etc.)
- Do NOT extract opinions about topics, questions they asked, or conversation filler
- Keep facts SHORT and specific: "Se llama Mario" not "El usuario mencionó que su nombre es Mario"
- Dates: always include the specific date/name (e.g., "Aniversario con Ana: 15 de septiembre")
- If there are NO personal facts, return []
- Maximum 5 facts per extraction`,
        },
        {
          role: "user",
          content: `User said: "${userMessage.slice(0, 500)}"\nAssistant replied: "${assistantResponse.slice(0, 300)}"\n\nExtract personal facts about the user:`,
        },
      ],
    });

    const content = res.choices[0]?.message?.content?.trim();
    if (!content || content === "[]") return;

    // Parse facts
    let facts: ExtractedFact[];
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      facts = JSON.parse(cleaned);
      if (!Array.isArray(facts)) return;
    } catch {
      return; // Bad JSON, skip silently
    }

    // Upsert each fact
    for (const f of facts) {
      if (!f.fact || !f.category || !CATEGORIES.includes(f.category)) continue;

      // Check if similar fact already exists
      const { data: existing } = await supabase
        .from("user_facts")
        .select("id, times_observed, confidence")
        .eq("user_id", userId)
        .eq("fact", f.fact)
        .maybeSingle();

      if (existing) {
        // Fact already known — increase confidence
        const newConfidence = Math.min(1, existing.confidence + 0.1);
        await supabase.from("user_facts").update({
          confidence: newConfidence,
          times_observed: existing.times_observed + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        // New fact
        await supabase.from("user_facts").insert({
          user_id: userId,
          category: f.category,
          fact: f.fact,
          confidence: f.source === "explicit" ? 0.9 : 0.5,
          source: f.source,
        });
      }
    }
  } catch (err) {
    // Non-critical — never break the chat flow
    console.error("[Facts] Extraction error:", err);
  }
}

/**
 * Load the user's top facts to inject into the system prompt.
 * Returns a formatted string, or empty if no facts.
 */
export async function loadUserFacts(userId: string): Promise<string> {
  try {
    const { data: facts } = await supabase
      .from("user_facts")
      .select("category, fact, confidence")
      .eq("user_id", userId)
      .gte("confidence", 0.4)
      .order("confidence", { ascending: false })
      .limit(25);

    if (!facts || facts.length === 0) return "";

    // Group by category
    const grouped: Record<string, string[]> = {};
    for (const f of facts) {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f.fact);
    }

    const categoryLabels: Record<string, string> = {
      identity: "Identidad",
      routine: "Rutina",
      preferences: "Preferencias",
      relationships: "Relaciones",
      work: "Trabajo",
      finance: "Finanzas",
      health: "Salud",
      dates: "Fechas importantes",
      general: "Otros",
    };

    let result = "\nLO QUE SABES DE ESTE USUARIO (aprendido de conversaciones anteriores):\n";
    for (const [cat, items] of Object.entries(grouped)) {
      result += `\n${categoryLabels[cat] || cat}:\n`;
      for (const item of items) {
        result += `- ${item}\n`;
      }
    }
    result += "\nUsa esta información naturalmente. NO le digas que tienes un perfil guardado. Simplemente recuerda, como haría un amigo.\n";

    return result;
  } catch (err) {
    console.error("[Facts] Load error:", err);
    return "";
  }
}
