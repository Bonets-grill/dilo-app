// ══════════════════════════════════════
// CRISIS DETECTION — MOST CRITICAL FEATURE
// ══════════════════════════════════════
// Before ANY wellness response, check for crisis keywords.
// If detected, return ONLY the crisis response. Do NOT continue.

export const CRISIS_KEYWORDS: string[] = [
  // Spanish
  "suicidarme", "suicidio", "quitarme la vida", "no quiero vivir",
  "matarme", "acabar con todo", "ya no puedo mas", "mejor muerto",
  "cortarme", "hacerme dano", "autolesion", "me pegan",
  "abuso sexual", "violacion", "me maltratan", "quiero morir",
  "no veo salida",
  // English
  "suicide", "kill myself", "end my life", "don't want to live",
  "dont want to live", "self-harm", "cutting", "domestic violence",
  "abuse", "i want to die",
  // French
  "me suicider", "mettre fin a mes jours", "je veux mourir",
  // Italian
  "suicidarmi", "voglio morire", "farla finita",
  // German
  "umbringen", "selbstmord", "ich will sterben",
];

export const CRISIS_RESPONSES: Record<string, string> = {
  es: `\u{1F198} **Si estas en crisis, no estas solo/a. Hay ayuda disponible ahora mismo.**

\u{1F4DE} **Telefono de la Esperanza**: 717 003 717 (24h, gratuito)
\u{1F4DE} **Linea de Atencion a la Conducta Suicida**: 024 (24h)
\u{1F6D1} **Emergencias**: 112

Por favor, llama ahora. Hay personas capacitadas esperando para ayudarte.`,

  en: `\u{1F198} **If you are in crisis, you are not alone. Help is available right now.**

\u{1F4DE} **988 Suicide & Crisis Lifeline**: Call or text 988
\u{1F4AC} **Crisis Text Line**: Text HOME to 741741
\u{1F6D1} **Emergency**: 911

Please reach out now. Trained counselors are waiting to help you.`,

  fr: `\u{1F198} **Si vous etes en crise, vous n'etes pas seul/e. De l'aide est disponible.**

\u{1F4DE} **SOS Amitie**: 09 72 39 40 50 (24h)
\u{1F4DE} **Fil Sante Jeunes**: 0 800 235 236
\u{1F6D1} **Urgences**: 112

Appelez maintenant. Des personnes formees vous attendent.`,

  it: `\u{1F198} **Se sei in crisi, non sei solo/a. L'aiuto e disponibile adesso.**

\u{1F4DE} **Telefono Amico**: 02 2327 2327 (24h)
\u{1F4DE} **Telefono Azzurro**: 19696
\u{1F6D1} **Emergenze**: 112

Per favore, chiama adesso. Ci sono persone pronte ad aiutarti.`,

  de: `\u{1F198} **Wenn du in einer Krise bist, bist du nicht allein. Hilfe ist jetzt verfugbar.**

\u{1F4DE} **Telefonseelsorge**: 0800 111 0 111 (24h, kostenlos)
\u{1F4DE} **Telefonseelsorge**: 0800 111 0 222 (24h, kostenlos)
\u{1F6D1} **Notfall**: 112

Bitte ruf jetzt an. Ausgebildete Berater warten darauf, dir zu helfen.`,
};

/**
 * Normalize text: lowercase, remove accents/diacritics, trim
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritical marks
    .replace(/[''`]/g, "'")
    .trim();
}

/**
 * Detect crisis keywords in user message.
 * Returns the full crisis response string if detected, or null if safe.
 */
export function detectCrisis(userMessage: string, locale: string): string | null {
  const normalized = normalize(userMessage);

  for (const keyword of CRISIS_KEYWORDS) {
    if (normalized.includes(keyword)) {
      const lang = locale.substring(0, 2);
      return CRISIS_RESPONSES[lang] || CRISIS_RESPONSES["es"];
    }
  }

  return null;
}
