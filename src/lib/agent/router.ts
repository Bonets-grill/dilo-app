/**
 * SMART ROUTER — Detects user intent and routes to direct execution or LLM
 *
 * Cost savings: ~70% of requests bypass the LLM entirely
 *
 * Routes:
 * - IMAGE → Stability AI / DALL-E (no LLM)
 * - EXPENSE → Direct DB insert (no LLM)
 * - REMINDER → Direct DB insert (no LLM)
 * - WHATSAPP_SEND → Direct Evolution API (no LLM, needs confirmation)
 * - CALCULATOR → Direct eval (no LLM)
 * - EXPENSE_QUERY → Direct DB query (no LLM)
 * - REMINDER_QUERY → Direct DB query (no LLM)
 * - CHAT → GPT-4o-mini (needs LLM)
 */

export type RouteType =
  | "image"
  | "expense"
  | "expense_query"
  | "reminder"
  | "reminder_query"
  | "calculator"
  | "whatsapp_send"
  | "whatsapp_read"
  | "web_search"
  | "shopping_compare"
  | "gasolineras"
  | "restaurantes"
  | "electricidad"
  | "farmacia"
  | "seguros"
  | "telefonia"
  | "ayudas_publicas"
  | "cupones_delivery"
  | "comparar_producto"
  | "conectar_google"
  | "suscripciones"
  | "cupones"
  | "alerta_precio"
  | "trading_connect"
  | "trading"
  | "market_scan"
  | "market_analyze"
  | "trading_calendar"
  | "trading_portfolio"
  | "chat";

export interface RouteResult {
  type: RouteType;
  data?: Record<string, unknown>;
}

export function detectIntent(text: string): RouteResult {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // IMAGE: "créame una imagen", "genera una foto", "dibuja", "logo"
  if (/(?:crea|genera|dibuja|hazme|diseña|haz)\s*(?:me\s+)?(?:una?\s+)?(?:imagen|foto|ilustracion|logo|dibujo|diseño)/i.test(lower)
    || /(?:create|generate|draw|make)\s*(?:me\s+)?(?:an?\s+)?(?:image|photo|picture|logo|illustration)/i.test(lower)) {
    return { type: "image" };
  }

  // EXPENSE: "gasté 45 en comida", "pagué 30", "me costó 12"
  const expenseMatch = lower.match(/(?:gaste|pague|costo|cuesta|compre|gasto)\s.*?(\d+[.,]?\d*)/);
  if (expenseMatch) {
    // Extract multiple expenses: "gasté 12 en comida, 45 en super y 30 en gasolina"
    const expenses: Array<{ amount: number; description: string; category: string }> = [];
    const parts = text.split(/[,;]\s*|\s+y\s+/i);

    for (const part of parts) {
      const amountMatch = part.match(/(\d+[.,]?\d*)\s*(?:euros?|€)?\s*(?:en\s+)?(.+)?/i);
      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(",", "."));
        const desc = amountMatch[2]?.trim() || "gasto";
        const category = categorizeExpense(desc);
        if (amount > 0) expenses.push({ amount, description: desc, category });
      }
    }

    if (expenses.length > 0) {
      return { type: "expense", data: { expenses } };
    }
  }

  // EXPENSE QUERY: "cuánto gasté", "mis gastos", "resumen de gastos"
  if (/(?:cuanto\s+gaste|mis\s+gastos|resumen\s+de\s+gastos|gastos\s+de\s+hoy|gastos\s+del\s+mes|gastos\s+de\s+la\s+semana|how\s+much\s+.*spend)/i.test(lower)) {
    const period = lower.includes("semana") || lower.includes("week") ? "week"
      : lower.includes("mes") || lower.includes("month") ? "month" : "today";
    return { type: "expense_query", data: { period } };
  }

  // REMINDER CREATE: "recuérdame en 5 minutos", "ponme un recordatorio", "recuerda hacer X",
  // "agéndame una cita para...", "apúntame la cita del dentista".
  //
  // Negative lookahead: "recuerda" seguido de "mi/mis/cuándo/dónde/qué/cuál" es
  // una QUERY ("recuerda mi cita con X" = "dime cuándo es mi cita"), NO create.
  // Esas caen al flow normal donde el LLM puede usar calendar_list / memory.
  // But NOT "avísame cuando baje" (that's a price alert).
  const reminderVerbs = /(?:recu[eé]rda(?:me)?(?!\s+(mi|mis|cu[aá]ndo|d[oó]nde|qu[eé]|cu[aá]l|nuestr[ao]))|recordatorio|alarma|remind\s+me|ag[eé]nd[aá]me|ap[uú]nta(?:me)?|anota(?:me)?|ponme\s+un|pon\s+una|crea\s+(?:un|una)\s+(?:recordatorio|cita|alarma))/i;
  if (reminderVerbs.test(lower)
    || (/avisame/i.test(lower) && !/(?:baj[ea]|precio|cuesta|oferta)/i.test(lower))) {
    return { type: "reminder" }; // Complex — needs LLM to parse time
  }

  // REMINDER QUERY: "qué recordatorios tengo", "cuáles son mis recordatorios", "dime mis recordatorios"
  // Strict: solo si menciona "recordatorio" y es pregunta. Queries sobre citas
  // de calendario ("cuándo es mi próxima cita") se dejan al flow normal con
  // calendar_list disponible.
  if (/recordatorio/i.test(lower) && /(?:tengo|cuales|que|mis|pendientes|ver|mostrar|lista|dime|show|list|what|my)/i.test(lower)) {
    if (!/(?:recuerdame|recordatorio\s+(?:de|para|a\s+las)|ponme|crea|pon\s+un|set|create|remind\s+me)/i.test(lower)) {
      return { type: "reminder_query" };
    }
  }

  // CALCULATOR: "cuánto es 45 + 30", "calcula 100 * 0.21"
  const calcMatch = lower.match(/^(?:cuanto\s+es|calcula|calculate)\s+([\d+\-*/()., ]+)$/i);
  if (calcMatch) {
    return { type: "calculator", data: { expression: calcMatch[1] } };
  }
  // Also detect pure math: "45 + 30 + 12" (but NOT phone numbers like +34665625567)
  if (/^\s*[\d+\-*/()., ]+\s*$/.test(text.trim()) && /\d/.test(text) && /[+\-*/]/.test(text)
    && !/^\+?\d{7,}$/.test(text.trim())) {
    return { type: "calculator", data: { expression: text.trim() } };
  }

  // WHATSAPP SEND: "envía/manda un whatsapp/mensaje al..."
  if (/(?:envia|manda|send)\s+.*(?:whatsapp|mensaje|message)\s+.*\d{8,}/i.test(lower)
    || /(?:envia|manda|send)\s+.*\d{8,}/i.test(lower)) {
    return { type: "whatsapp_send" }; // Complex — needs LLM to compose message
  }

  // WHATSAPP READ: "lee mis mensajes", "qué me escribió"
  if (/(?:lee\s+mis\s+mensajes|mensajes\s+nuevos|que\s+me\s+escribi|read\s+my\s+messages|unread)/i.test(lower)) {
    return { type: "whatsapp_read" };
  }

  // ── ALL OTHER QUERIES → 2-step LLM classifier handles them ──
  // Removed: electricidad, farmacia, seguros, telefonia, ayudas, cupones,
  // conectar_google, suscripciones, alerta_precio, trading_connect,
  // trading, market_scan, market_analyze, trading_calendar, trading_portfolio,
  // comparar_producto, restaurantes, gasolineras, shopping, web_search
  //
  // Why: regex patterns were too aggressive and caught wrong things
  // (e.g., "película" → trading, "clima" → stock ticker)
  // The 2-step classifier in classifier.ts handles all of these correctly.

  // DEFAULT: goes to 2-step LLM classifier
  return { type: "chat" };
}

function categorizeExpense(desc: string): string {
  const lower = desc.toLowerCase();
  if (/comida|restaurante|almuerzo|cena|desayuno|cafe|super|mercadona|lidl|carrefour|naranja/i.test(lower)) return "food";
  if (/gasolina|combustible|petroleo|parking|taxi|uber|bus|metro|transporte|peaje/i.test(lower)) return "transport";
  if (/cine|teatro|netflix|spotify|juego|ocio|bar|copa|fiesta/i.test(lower)) return "entertainment";
  if (/alquiler|luz|agua|gas|internet|telefono|seguro|comunidad/i.test(lower)) return "bills";
  if (/farmacia|medico|dentista|hospital|medicina|pastilla/i.test(lower)) return "health";
  if (/ropa|zapatos|amazon|tienda|regalo|compra/i.test(lower)) return "shopping";
  if (/casa|mueble|ikea|decoracion|limpieza/i.test(lower)) return "home";
  return "other";
}
