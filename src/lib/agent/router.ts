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

  // REMINDER: "recuérdame en 5 minutos", "ponme un recordatorio"
  // But NOT "avísame cuando baje" (that's a price alert)
  if (/(?:recuerdame|recordatorio|alarma|remind\s+me)/i.test(lower)
    || (/avisame/i.test(lower) && !/(?:baj[ea]|precio|cuesta|oferta)/i.test(lower))) {
    return { type: "reminder" }; // Complex — needs LLM to parse time
  }

  // REMINDER QUERY: "qué recordatorios tengo", "cuáles son mis recordatorios", "dime mis recordatorios"
  if (/recordatorio/i.test(lower) && /(?:tengo|cuales|que|mis|pendientes|ver|mostrar|lista|dime|show|list|what|my)/i.test(lower)) {
    // But NOT if it's creating a reminder ("recuérdame", "ponme un recordatorio")
    if (!/(?:recuerdame|recordatorio\s+(?:de|para|a\s+las)|ponme|crea|pon\s+un|set|create|remind\s+me)/i.test(lower)) {
      return { type: "reminder_query" };
    }
  }

  // CALCULATOR: "cuánto es 45 + 30", "calcula 100 * 0.21"
  const calcMatch = lower.match(/^(?:cuanto\s+es|calcula|calculate)\s+([\d+\-*/()., ]+)$/i);
  if (calcMatch) {
    return { type: "calculator", data: { expression: calcMatch[1] } };
  }
  // Also detect pure math: "45 + 30 + 12"
  if (/^\s*[\d+\-*/()., ]+\s*$/.test(text.trim()) && /\d/.test(text) && /[+\-*/]/.test(text)) {
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

  // ELECTRICIDAD: "precio de la luz", "cuándo poner lavadora", "tarifa eléctrica"
  if (/(?:luz|electric|tarifa.*luz|pvpc|precio.*kwh|lavadora.*hora|hora.*barata.*luz|consumo.*electr)/i.test(lower)) {
    return { type: "electricidad" };
  }

  // FARMACIA: "precio ibuprofeno", "medicamento barato", "farmacia"
  if (/(?:medicament|farmacia|pastilla|ibuprofeno|paracetamol|genérico|precio.*medic)/i.test(lower)
    && /(?:precio|barat|compar|donde|cuanto|alternativa|generic)/i.test(lower)) {
    return { type: "farmacia", data: { query: text } };
  }

  // SEGUROS: "comparar seguro", "seguro barato", "renovar seguro"
  if (/(?:seguro|poliza|cobertura)/i.test(lower) && /(?:barat|compar|mejor|renov|alternativ)/i.test(lower)) {
    const type = /coche|auto|vehiculo/i.test(lower) ? "coche" : /hogar|casa|vivienda/i.test(lower) ? "hogar" : /medic|salud|dental/i.test(lower) ? "médico" : "general";
    return { type: "seguros", data: { insuranceType: type } };
  }

  // TELEFONIA: "comparar tarifa móvil", "internet barato"
  if (/(?:tarifa|movil|fibra|internet|telefon|operador|digi|movistar|vodafone|orange)/i.test(lower)
    && /(?:barat|compar|mejor|cambiar|alternativ)/i.test(lower)) {
    return { type: "telefonia" };
  }

  // AYUDAS PUBLICAS: "ayudas", "subvenciones", "bono social"
  if (/(?:ayuda.*public|subvencion|bono\s+social|deduccion|beca|prestacion)/i.test(lower)) {
    return { type: "ayudas_publicas", data: { query: text } };
  }

  // CUPONES / DELIVERY: "cupón just eat", "descuento restaurante"
  if (/(?:cupon|descuento|oferta|deal).*(?:restaurante|delivery|just\s*eat|glovo|uber\s*eats|thefork)/i.test(lower)) {
    return { type: "cupones_delivery" };
  }

  // CONECTAR GOOGLE: "conectar mi gmail", "conectar google", "vincular email"
  // Also catches email/calendar requests: "lee mis emails", "mis correos", "envía un email", "mi agenda"
  if (/(?:conectar?\s+(?:mi\s+)?(?:gmail|google|email|calendario|calendar)|vincular?\s+(?:mi\s+)?(?:gmail|google|email))/i.test(lower)
    || /(?:lee[r ]?\s*(?:mis\s+)?(?:emails?|correos?|e-?mails?)|mis\s+(?:emails?|correos?|e-?mails?)|envia\s+(?:un\s+)?(?:email|correo|e-?mail)|mi\s+agenda|mis\s+eventos|que\s+tengo\s+(?:en\s+)?(?:el\s+)?(?:calendario|agenda))/i.test(lower)) {
    return { type: "conectar_google" };
  }

  // SUSCRIPCIONES: "mis suscripciones", "pago mensual", "cuánto pago al mes"
  if (/(?:suscripcion|cargo\s+recurrente|pago\s+mensual|que\s+pago|cuanto\s+pago|detectar?\s+suscripcion|pago\s+netflix|pago\s+spotify|pago\s+gym)/i.test(lower)) {
    return { type: "suscripciones", data: { query: text } };
  }

  // CUPONES: "cupón para Zara", "código descuento Amazon", "ofertas"
  if (/(?:cupon|código\s+descuento|codigo\s+descuento|descuento\s+para|oferta\s+en|promo\s+code|discount\s+code)/i.test(lower)) {
    return { type: "cupones", data: { query: text } };
  }

  // ALERTA PRECIO: "avísame cuando baje", "rastrear precio", "monitorizar precio"
  if (/(?:avis[ae]me\s+cuando\s+baj|rastrear?\s+precio|monitoriz|alert[ae]\s+(?:de\s+)?precio|seguir?\s+(?:el\s+)?precio|watch\s+price)/i.test(lower)) {
    return { type: "alerta_precio", data: { query: text } };
  }

  // TRADING CONNECT: "conectar broker", "conectar alpaca", "vincular broker"
  if (/(?:conectar?\s+(?:mi\s+)?(?:broker|alpaca|trading|cuenta\s+de\s+trading)|vincular?\s+(?:mi\s+)?(?:broker|alpaca))/i.test(lower)) {
    return { type: "trading_connect" };
  }

  // TRADING: "mi portfolio", "mis posiciones", "mis acciones", "rendimiento trading", "reglas de riesgo", "compra acciones", "vende acciones"
  if (/(?:mi\s+portfolio|mis\s+posiciones|mis\s+acciones|como\s+van\s+mis\s+(?:acciones|posiciones|trades|inversiones)|my\s+portfolio|my\s+positions|my\s+stocks)/i.test(lower)
    || /(?:rendimiento|performance|win\s+rate|profit\s+factor|estadisticas?\s+(?:de\s+)?trading)/i.test(lower)
    || /(?:sincronizar?\s+(?:mi\s+)?(?:journal|diario|trades)|importar?\s+trades)/i.test(lower)
    || /(?:analisis\s+de\s+riesgo|riesgo\s+(?:de\s+)?(?:mi\s+)?portfolio|diversificacion)/i.test(lower)
    || /(?:reglas?\s+de\s+(?:riesgo|trading)|limite\s+(?:de\s+)?(?:perdida|trades)|max(?:imo)?\s+(?:trades|perdida))/i.test(lower)
    || /(?:compra|vende|comprar|vender)\s+\d*\s*(?:acciones?\s+(?:de\s+)?)?[A-Z]{1,5}\b/i.test(lower)
    || /(?:compra|vende|comprar|vender)\s+(?:acciones?\s+(?:de\s+)?)?(?:apple|tesla|amazon|google|microsoft|nvidia|meta|netflix)/i.test(lower)) {
    return { type: "trading" };
  }

  // COMPARAR PRODUCTO: "compara precio MacBook", "donde comprar más barato"
  if (/(?:compar.*precio|donde.*comprar.*barat|mas\s+barato|mejor\s+precio)/i.test(lower)
    && !/(?:vuelo|hotel|restaurante|gasolina|super)/i.test(lower)) {
    return { type: "comparar_producto", data: { query: text } };
  }

  // RESTAURANTES: "restaurante cerca", "dónde comer", "mejores restaurantes"
  if (/(?:restaurante|comer|cenar|almorzar|brunch|comida|donde\s+com)/i.test(lower)
    && /(?:buen|mejor|cerca|recomiend|donde|bueno|barato|top|popular|rating)/i.test(lower)) {
    // Extract cuisine type if mentioned
    const cuisineMatch = lower.match(/(?:restaurante|comida)\s+(?:de\s+)?(\w+)/i);
    const cuisine = cuisineMatch?.[1] && !["cerca","bueno","barato","mejor"].includes(cuisineMatch[1]) ? cuisineMatch[1] : undefined;
    return { type: "restaurantes", data: { cuisine } };
  }

  // GASOLINERAS: "gasolina barata", "dónde repostar", "precio gasolina"
  if (/(?:gasolin|gasoleo|diesel|repostar|combustible|gasolinera)/i.test(lower)
    && /(?:barat|precio|mejor|cerca|donde|barata|económic|cheap)/i.test(lower)) {
    const isDiesel = /(?:diesel|gasoleo|gasóleo)/i.test(lower);
    return { type: "gasolineras", data: { fuelType: isDiesel ? "gasoleoA" : "gasolina95" } };
  }

  // SHOPPING LIST: "necesito comprar leche, pan, arroz", "lista de compras", "compara precios"
  if (/(?:lista\s+de\s+compra|necesito\s+comprar|compara\s+precios?\s+(?:de|en)\s+super|compra\s+(?:en|del)\s+super|precio.*(?:leche|pan|arroz|pasta|pollo|huevo|aceite|fruta|verdura|carne))/i.test(lower)
    || (/(?:comprar|compra)/i.test(lower) && /(?:leche|pan|arroz|pasta|pollo|huevo|aceite|atun|cafe|azucar|sal|jamon|queso|yogur|cerveza|agua|tomate|cebolla|patata|platano|manzana)/i.test(lower))) {
    return { type: "shopping_compare", data: { query: text } };
  }

  // WEB SEARCH: "busca en internet/google", "qué precio tiene", "vuelos a", "noticias de"
  if (/(?:busca|buscar|busque|busqueda|search|googlea|investiga)\s/i.test(lower)
    || /(?:vuelos?\s+(?:a|de|desde|para|barato)|flight)/i.test(lower)
    || /(?:precio|coste|cuesta|cuanto\s+vale|cuanto\s+cuesta|how\s+much)/i.test(lower) && /(?:comprar|producto|servicio|vuelo|hotel|coche)/i.test(lower)
    || /(?:noticias|news|que\s+paso\s+con|que\s+ha\s+pasado)/i.test(lower)
    || /(?:clima|tiempo\s+(?:en|para|manana)|weather|temperatura|llueve|lluvia)/i.test(lower)) {
    return { type: "web_search", data: { query: text } };
  }

  // DEFAULT: needs LLM
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
