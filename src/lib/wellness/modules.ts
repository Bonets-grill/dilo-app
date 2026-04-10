// ══════════════════════════════════════
// STRUCTURED WELLNESS MODULES
// ══════════════════════════════════════
// 5 evidence-based modules. NOT free LLM generation.
// Each has fixed steps with prompts in 5 locales.

export type Locale = "es" | "en" | "fr" | "it" | "de";
type L10n = Record<Locale, string>;

export interface ModuleStep {
  id: string;
  prompt: L10n;
  type: "text" | "number" | "select" | "info";
  options?: L10n[]; // for select type
}

export interface WellnessModule {
  id: string;
  name: L10n;
  type: string;
  description: L10n;
  estimated_minutes: number;
  steps: ModuleStep[];
}

// ── 1. Thought Challenge (CBT) ──
const THOUGHT_CHALLENGE: WellnessModule = {
  id: "thought_challenge",
  name: {
    es: "Desafio de Pensamiento",
    en: "Thought Challenge",
    fr: "Defi de Pensee",
    it: "Sfida del Pensiero",
    de: "Gedanken-Challenge",
  },
  type: "cbt",
  description: {
    es: "Identifica y reestructura pensamientos negativos usando tecnicas cognitivo-conductuales.",
    en: "Identify and restructure negative thoughts using cognitive-behavioral techniques.",
    fr: "Identifiez et restructurez les pensees negatives avec des techniques cognitivo-comportementales.",
    it: "Identifica e ristruttura i pensieri negativi usando tecniche cognitivo-comportamentali.",
    de: "Identifiziere und strukturiere negative Gedanken mit kognitiv-verhaltenstherapeutischen Techniken um.",
  },
  estimated_minutes: 10,
  steps: [
    {
      id: "identify",
      type: "text",
      prompt: {
        es: "Escribe el pensamiento negativo que tienes ahora mismo, tal como te viene a la mente.",
        en: "Write down the negative thought you are having right now, exactly as it comes to mind.",
        fr: "Ecris la pensee negative que tu as en ce moment, telle qu'elle te vient a l'esprit.",
        it: "Scrivi il pensiero negativo che hai in questo momento, cosi come ti viene in mente.",
        de: "Schreibe den negativen Gedanken auf, den du gerade hast, genau so wie er dir in den Sinn kommt.",
      },
    },
    {
      id: "rate_belief",
      type: "number",
      prompt: {
        es: "Del 1 al 10, cuanto crees en ese pensamiento ahora mismo?",
        en: "From 1 to 10, how much do you believe this thought right now?",
        fr: "De 1 a 10, a quel point crois-tu a cette pensee en ce moment?",
        it: "Da 1 a 10, quanto credi a questo pensiero in questo momento?",
        de: "Von 1 bis 10, wie sehr glaubst du diesem Gedanken gerade?",
      },
    },
    {
      id: "evidence_for",
      type: "text",
      prompt: {
        es: "Que evidencia REAL tienes a favor de ese pensamiento? (solo hechos, no opiniones)",
        en: "What REAL evidence do you have FOR this thought? (facts only, not opinions)",
        fr: "Quelles preuves REELLES as-tu en faveur de cette pensee? (faits uniquement)",
        it: "Quali prove REALI hai a favore di questo pensiero? (solo fatti, non opinioni)",
        de: "Welche ECHTEN Beweise hast du FUR diesen Gedanken? (nur Fakten, keine Meinungen)",
      },
    },
    {
      id: "evidence_against",
      type: "text",
      prompt: {
        es: "Que evidencia REAL tienes EN CONTRA de ese pensamiento?",
        en: "What REAL evidence do you have AGAINST this thought?",
        fr: "Quelles preuves REELLES as-tu CONTRE cette pensee?",
        it: "Quali prove REALI hai CONTRO questo pensiero?",
        de: "Welche ECHTEN Beweise hast du GEGEN diesen Gedanken?",
      },
    },
    {
      id: "friend_perspective",
      type: "text",
      prompt: {
        es: "Si un amigo te dijera esto, que le dirias tu?",
        en: "If a friend told you this, what would you say to them?",
        fr: "Si un ami te disait cela, que lui dirais-tu?",
        it: "Se un amico ti dicesse questo, cosa gli diresti?",
        de: "Wenn ein Freund dir das erzahlen wurde, was wurdest du ihm sagen?",
      },
    },
    {
      id: "alternative",
      type: "text",
      prompt: {
        es: "Escribe un pensamiento alternativo mas equilibrado y realista.",
        en: "Write an alternative thought that is more balanced and realistic.",
        fr: "Ecris une pensee alternative plus equilibree et realiste.",
        it: "Scrivi un pensiero alternativo piu equilibrato e realistico.",
        de: "Schreibe einen alternativen Gedanken, der ausgeglichener und realistischer ist.",
      },
    },
    {
      id: "rate_again",
      type: "number",
      prompt: {
        es: "Del 1 al 10, cuanto crees en el pensamiento original AHORA?",
        en: "From 1 to 10, how much do you believe the original thought NOW?",
        fr: "De 1 a 10, a quel point crois-tu a la pensee originale MAINTENANT?",
        it: "Da 1 a 10, quanto credi al pensiero originale ADESSO?",
        de: "Von 1 bis 10, wie sehr glaubst du dem ursprunglichen Gedanken JETZT?",
      },
    },
  ],
};

// ── 2. Breathing 4-7-8 ──
const BREATHING_478: WellnessModule = {
  id: "breathing_478",
  name: {
    es: "Respiracion 4-7-8",
    en: "4-7-8 Breathing",
    fr: "Respiration 4-7-8",
    it: "Respirazione 4-7-8",
    de: "4-7-8 Atmung",
  },
  type: "breathing",
  description: {
    es: "Tecnica de respiracion para reducir ansiedad y calmar el sistema nervioso.",
    en: "Breathing technique to reduce anxiety and calm the nervous system.",
    fr: "Technique de respiration pour reduire l'anxiete et calmer le systeme nerveux.",
    it: "Tecnica di respirazione per ridurre l'ansia e calmare il sistema nervoso.",
    de: "Atemtechnik zur Reduzierung von Angst und Beruhigung des Nervensystems.",
  },
  estimated_minutes: 5,
  steps: [
    {
      id: "mood_before",
      type: "number",
      prompt: {
        es: "Como te sientes ahora del 1 (muy mal) al 10 (genial)?",
        en: "How do you feel right now from 1 (very bad) to 10 (great)?",
        fr: "Comment te sens-tu maintenant de 1 (tres mal) a 10 (super)?",
        it: "Come ti senti adesso da 1 (molto male) a 10 (benissimo)?",
        de: "Wie fuhlst du dich jetzt von 1 (sehr schlecht) bis 10 (grossartig)?",
      },
    },
    {
      id: "breathing_guide",
      type: "info",
      prompt: {
        es: "Vamos a hacer 4 ciclos de respiracion 4-7-8:\n\n1. Inhala por la nariz contando hasta 4\n2. Aguanta la respiracion contando hasta 7\n3. Exhala por la boca contando hasta 8\n\nRepite 4 veces. Toma tu tiempo, no hay prisa.\n\nCuando termines, dime como te sientes.",
        en: "Let's do 4 cycles of 4-7-8 breathing:\n\n1. Inhale through your nose counting to 4\n2. Hold your breath counting to 7\n3. Exhale through your mouth counting to 8\n\nRepeat 4 times. Take your time, there's no rush.\n\nWhen you're done, tell me how you feel.",
        fr: "Faisons 4 cycles de respiration 4-7-8:\n\n1. Inspire par le nez en comptant jusqu'a 4\n2. Retiens ta respiration en comptant jusqu'a 7\n3. Expire par la bouche en comptant jusqu'a 8\n\nRepete 4 fois. Prends ton temps.\n\nQuand tu as fini, dis-moi comment tu te sens.",
        it: "Facciamo 4 cicli di respirazione 4-7-8:\n\n1. Inspira dal naso contando fino a 4\n2. Trattieni il respiro contando fino a 7\n3. Espira dalla bocca contando fino a 8\n\nRipeti 4 volte. Prenditi il tuo tempo.\n\nQuando hai finito, dimmi come ti senti.",
        de: "Lass uns 4 Zyklen der 4-7-8 Atmung machen:\n\n1. Atme durch die Nase ein und zahle bis 4\n2. Halte den Atem an und zahle bis 7\n3. Atme durch den Mund aus und zahle bis 8\n\nWiederhole 4 mal. Nimm dir Zeit.\n\nWenn du fertig bist, sag mir wie du dich fuhlst.",
      },
    },
    {
      id: "mood_after",
      type: "number",
      prompt: {
        es: "Como te sientes ahora del 1 al 10?",
        en: "How do you feel now from 1 to 10?",
        fr: "Comment te sens-tu maintenant de 1 a 10?",
        it: "Come ti senti adesso da 1 a 10?",
        de: "Wie fuhlst du dich jetzt von 1 bis 10?",
      },
    },
  ],
};

// ── 3. Gratitude ──
const GRATITUDE: WellnessModule = {
  id: "gratitude",
  name: {
    es: "Gratitud",
    en: "Gratitude",
    fr: "Gratitude",
    it: "Gratitudine",
    de: "Dankbarkeit",
  },
  type: "gratitude",
  description: {
    es: "Identifica 3 cosas buenas de tu dia para entrenar el cerebro en positividad.",
    en: "Identify 3 good things about your day to train your brain for positivity.",
    fr: "Identifie 3 bonnes choses de ta journee pour entrainer ton cerveau a la positivite.",
    it: "Identifica 3 cose belle della tua giornata per allenare il cervello alla positivita.",
    de: "Identifiziere 3 gute Dinge deines Tages, um dein Gehirn auf Positivitat zu trainieren.",
  },
  estimated_minutes: 3,
  steps: [
    {
      id: "thing_1",
      type: "text",
      prompt: {
        es: "Nombra algo bueno que te haya pasado hoy (por pequeno que sea).",
        en: "Name something good that happened to you today (no matter how small).",
        fr: "Nomme quelque chose de bien qui t'est arrive aujourd'hui (aussi petit soit-il).",
        it: "Nomina qualcosa di bello che ti e successo oggi (per quanto piccolo).",
        de: "Nenne etwas Gutes, das dir heute passiert ist (egal wie klein).",
      },
    },
    {
      id: "thing_2",
      type: "text",
      prompt: {
        es: "Nombra una segunda cosa buena.",
        en: "Name a second good thing.",
        fr: "Nomme une deuxieme bonne chose.",
        it: "Nomina una seconda cosa bella.",
        de: "Nenne eine zweite gute Sache.",
      },
    },
    {
      id: "thing_3",
      type: "text",
      prompt: {
        es: "Y una tercera. Puede ser algo que alguien hizo por ti, algo que lograste, o algo bonito que viste.",
        en: "And a third one. It can be something someone did for you, something you achieved, or something beautiful you saw.",
        fr: "Et une troisieme. Ca peut etre quelque chose que quelqu'un a fait pour toi, quelque chose que tu as accompli, ou quelque chose de beau que tu as vu.",
        it: "E una terza. Puo essere qualcosa che qualcuno ha fatto per te, qualcosa che hai raggiunto, o qualcosa di bello che hai visto.",
        de: "Und eine dritte. Es kann etwas sein, das jemand fur dich getan hat, etwas das du erreicht hast, oder etwas Schones das du gesehen hast.",
      },
    },
  ],
};

// ── 4. Grounding 5-4-3-2-1 ──
const GROUNDING_54321: WellnessModule = {
  id: "grounding_54321",
  name: {
    es: "Anclaje 5-4-3-2-1",
    en: "5-4-3-2-1 Grounding",
    fr: "Ancrage 5-4-3-2-1",
    it: "Radicamento 5-4-3-2-1",
    de: "5-4-3-2-1 Erdung",
  },
  type: "grounding",
  description: {
    es: "Tecnica sensorial para volver al presente cuando sientes ansiedad o desconexion.",
    en: "Sensory technique to come back to the present when feeling anxious or disconnected.",
    fr: "Technique sensorielle pour revenir au present quand tu te sens anxieux ou deconnecte.",
    it: "Tecnica sensoriale per tornare al presente quando ti senti ansioso o disconnesso.",
    de: "Sensorische Technik, um in die Gegenwart zuruckzukehren wenn du dich angstlich oder abgetrennt fuhlst.",
  },
  estimated_minutes: 5,
  steps: [
    {
      id: "see_5",
      type: "text",
      prompt: {
        es: "Mira a tu alrededor. Nombra 5 cosas que puedas VER.",
        en: "Look around you. Name 5 things you can SEE.",
        fr: "Regarde autour de toi. Nomme 5 choses que tu peux VOIR.",
        it: "Guardati intorno. Nomina 5 cose che puoi VEDERE.",
        de: "Schau dich um. Nenne 5 Dinge die du SEHEN kannst.",
      },
    },
    {
      id: "touch_4",
      type: "text",
      prompt: {
        es: "Nombra 4 cosas que puedas TOCAR ahora mismo.",
        en: "Name 4 things you can TOUCH right now.",
        fr: "Nomme 4 choses que tu peux TOUCHER maintenant.",
        it: "Nomina 4 cose che puoi TOCCARE adesso.",
        de: "Nenne 4 Dinge die du jetzt BERUHREN kannst.",
      },
    },
    {
      id: "hear_3",
      type: "text",
      prompt: {
        es: "Nombra 3 cosas que puedas OIR.",
        en: "Name 3 things you can HEAR.",
        fr: "Nomme 3 choses que tu peux ENTENDRE.",
        it: "Nomina 3 cose che puoi SENTIRE.",
        de: "Nenne 3 Dinge die du HOREN kannst.",
      },
    },
    {
      id: "smell_2",
      type: "text",
      prompt: {
        es: "Nombra 2 cosas que puedas OLER.",
        en: "Name 2 things you can SMELL.",
        fr: "Nomme 2 choses que tu peux SENTIR (odeurs).",
        it: "Nomina 2 cose che puoi ANNUSARE.",
        de: "Nenne 2 Dinge die du RIECHEN kannst.",
      },
    },
    {
      id: "taste_1",
      type: "text",
      prompt: {
        es: "Nombra 1 cosa que puedas SABOREAR (o recuerda un sabor agradable).",
        en: "Name 1 thing you can TASTE (or recall a pleasant taste).",
        fr: "Nomme 1 chose que tu peux GOUTER (ou rappelle-toi un gout agreable).",
        it: "Nomina 1 cosa che puoi ASSAPORARE (o ricorda un sapore piacevole).",
        de: "Nenne 1 Ding das du SCHMECKEN kannst (oder erinnere dich an einen angenehmen Geschmack).",
      },
    },
  ],
};

// ── 5. Emotional Journal ──
const EMOTIONAL_JOURNAL: WellnessModule = {
  id: "emotional_journal",
  name: {
    es: "Diario Emocional",
    en: "Emotional Journal",
    fr: "Journal Emotionnel",
    it: "Diario Emotivo",
    de: "Emotionales Tagebuch",
  },
  type: "journal",
  description: {
    es: "Identifica, comprende y procesa tus emociones de forma guiada.",
    en: "Identify, understand and process your emotions in a guided way.",
    fr: "Identifie, comprends et traite tes emotions de maniere guidee.",
    it: "Identifica, comprendi e elabora le tue emozioni in modo guidato.",
    de: "Identifiziere, verstehe und verarbeite deine Emotionen auf angeleitete Weise.",
  },
  estimated_minutes: 5,
  steps: [
    {
      id: "emotion_select",
      type: "select",
      prompt: {
        es: "Que emocion describe mejor lo que sientes ahora?",
        en: "Which emotion best describes what you are feeling now?",
        fr: "Quelle emotion decrit le mieux ce que tu ressens maintenant?",
        it: "Quale emozione descrive meglio quello che provi adesso?",
        de: "Welche Emotion beschreibt am besten, was du gerade fuhlst?",
      },
      options: [
        { es: "Tristeza", en: "Sadness", fr: "Tristesse", it: "Tristezza", de: "Traurigkeit" },
        { es: "Ansiedad", en: "Anxiety", fr: "Anxiete", it: "Ansia", de: "Angst" },
        { es: "Ira", en: "Anger", fr: "Colere", it: "Rabbia", de: "Wut" },
        { es: "Miedo", en: "Fear", fr: "Peur", it: "Paura", de: "Furcht" },
        { es: "Frustracion", en: "Frustration", fr: "Frustration", it: "Frustrazione", de: "Frustration" },
        { es: "Soledad", en: "Loneliness", fr: "Solitude", it: "Solitudine", de: "Einsamkeit" },
        { es: "Culpa", en: "Guilt", fr: "Culpabilite", it: "Colpa", de: "Schuld" },
        { es: "Estres", en: "Stress", fr: "Stress", it: "Stress", de: "Stress" },
        { es: "Confusion", en: "Confusion", fr: "Confusion", it: "Confusione", de: "Verwirrung" },
        { es: "Alegria", en: "Joy", fr: "Joie", it: "Gioia", de: "Freude" },
        { es: "Agradecimiento", en: "Gratitude", fr: "Gratitude", it: "Gratitudine", de: "Dankbarkeit" },
        { es: "Calma", en: "Calm", fr: "Calme", it: "Calma", de: "Ruhe" },
      ],
    },
    {
      id: "cause",
      type: "text",
      prompt: {
        es: "Que crees que ha causado esta emocion? Describe la situacion brevemente.",
        en: "What do you think caused this emotion? Describe the situation briefly.",
        fr: "Qu'est-ce qui a cause cette emotion selon toi? Decris brievement la situation.",
        it: "Cosa pensi abbia causato questa emozione? Descrivi brevemente la situazione.",
        de: "Was glaubst du hat diese Emotion ausgelost? Beschreibe die Situation kurz.",
      },
    },
    {
      id: "action",
      type: "text",
      prompt: {
        es: "Que pequena accion podrias hacer ahora para sentirte un poco mejor?",
        en: "What small action could you take now to feel a little better?",
        fr: "Quelle petite action pourrais-tu faire maintenant pour te sentir un peu mieux?",
        it: "Quale piccola azione potresti fare adesso per sentirti un po' meglio?",
        de: "Welche kleine Aktion konntest du jetzt unternehmen, um dich etwas besser zu fuhlen?",
      },
    },
  ],
};

// ── Exports ──

export const WELLNESS_MODULES: WellnessModule[] = [
  THOUGHT_CHALLENGE,
  BREATHING_478,
  GRATITUDE,
  GROUNDING_54321,
  EMOTIONAL_JOURNAL,
];

export function getModule(id: string): WellnessModule | undefined {
  return WELLNESS_MODULES.find((m) => m.id === id);
}

export function getModuleSummaries(locale: Locale) {
  return WELLNESS_MODULES.map((m) => ({
    id: m.id,
    name: m.name[locale] || m.name.es,
    type: m.type,
    description: m.description[locale] || m.description.es,
    estimated_minutes: m.estimated_minutes,
    steps_count: m.steps.length,
  }));
}
