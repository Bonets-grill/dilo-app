/**
 * Cálculo de signo zodiacal desde fecha de nacimiento.
 * Emojis + nombre en español para la UI y el prompt del horóscopo.
 */

export type ZodiacSign =
  | "aries" | "tauro" | "geminis" | "cancer"
  | "leo" | "virgo" | "libra" | "escorpio"
  | "sagitario" | "capricornio" | "acuario" | "piscis";

export interface ZodiacInfo {
  key: ZodiacSign;
  name: string;
  emoji: string;
}

const SIGNS: Array<{ key: ZodiacSign; name: string; emoji: string; start: [number, number]; end: [number, number] }> = [
  { key: "capricornio", name: "Capricornio", emoji: "♑", start: [12, 22], end: [1, 19] },
  { key: "acuario",     name: "Acuario",     emoji: "♒", start: [1, 20],  end: [2, 18] },
  { key: "piscis",      name: "Piscis",      emoji: "♓", start: [2, 19],  end: [3, 20] },
  { key: "aries",       name: "Aries",       emoji: "♈", start: [3, 21],  end: [4, 19] },
  { key: "tauro",       name: "Tauro",       emoji: "♉", start: [4, 20],  end: [5, 20] },
  { key: "geminis",     name: "Géminis",     emoji: "♊", start: [5, 21],  end: [6, 20] },
  { key: "cancer",      name: "Cáncer",      emoji: "♋", start: [6, 21],  end: [7, 22] },
  { key: "leo",         name: "Leo",         emoji: "♌", start: [7, 23],  end: [8, 22] },
  { key: "virgo",       name: "Virgo",       emoji: "♍", start: [8, 23],  end: [9, 22] },
  { key: "libra",       name: "Libra",       emoji: "♎", start: [9, 23],  end: [10, 22] },
  { key: "escorpio",    name: "Escorpio",    emoji: "♏", start: [10, 23], end: [11, 21] },
  { key: "sagitario",   name: "Sagitario",   emoji: "♐", start: [11, 22], end: [12, 21] },
];

/** ISO "YYYY-MM-DD" → ZodiacInfo */
export function zodiacFromDate(iso: string): ZodiacInfo | null {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  for (const s of SIGNS) {
    const [sm, sd] = s.start;
    const [em, ed] = s.end;
    if (sm === em) {
      if (month === sm && day >= sd && day <= ed) return { key: s.key, name: s.name, emoji: s.emoji };
    } else if (sm > em) {
      // Capricornio (cruza año): dic 22 – ene 19
      if ((month === sm && day >= sd) || (month === em && day <= ed)) return { key: s.key, name: s.name, emoji: s.emoji };
    } else {
      if ((month === sm && day >= sd) || (month === em && day <= ed)) return { key: s.key, name: s.name, emoji: s.emoji };
    }
  }
  return null;
}

export function zodiacInfoBySign(sign: ZodiacSign): ZodiacInfo | null {
  const s = SIGNS.find((x) => x.key === sign);
  return s ? { key: s.key, name: s.name, emoji: s.emoji } : null;
}
