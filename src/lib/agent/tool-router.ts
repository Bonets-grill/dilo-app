import OpenAI from "openai";

/**
 * Smart Tool Router — filters tools based on user message intent.
 *
 * Problem: GPT-4o-mini with 60+ tools picks the wrong one frequently.
 * Solution: Detect intent with keywords, only send relevant tools to the LLM.
 *
 * Base tools (always included): reminders, expenses, calculate, generate_image
 * Category tools: only included when keywords match.
 * If no category detected: send ALL tools (fallback).
 */

interface ToolCategory {
  name: string;
  keywords: RegExp;
  toolPrefixes: string[];
}

const CATEGORIES: ToolCategory[] = [
  {
    name: "entertainment",
    keywords: /\b(pel[ií]cula|series?|cine|cartelera|ver (algo|hoy|esta noche)|movie|film|netflix|hbo|disney|qu[eé] ver|recomien?d|terror|comedia|drama|thriller|anime|documental|acci[oó]n|ciencia ficci[oó]n|trending|top rated|entertainment)\b/i,
    toolPrefixes: ["entertainment_"],
  },
  {
    name: "trading",
    keywords: /\b(trading|portfolio|posicion|acci[oó]n|acciones|stock|buy|sell|signal|se[nñ]al|mercado|bolsa|alpaca|broker|orden|P&L|rendimiento|dashboard|AAPL|NVDA|TSLA|AMZN|MSFT|META|GOOGL|SPY|QQQ|sweep|liquidez|SMC|forex_|market_|trading_)\b/i,
    toolPrefixes: ["trading_", "market_", "forex_"],
  },
  {
    name: "knowledge",
    keywords: /\b(wikipedia|qu[eé] es|qui[eé]n (es|fue)|historia de|c[oó]mo funciona|calcul|conver[ts]|BMI|IMC|millas|km|poblaci[oó]n|temperatura|f[oó]rmula|ecuaci[oó]n|wolfram|knowledge_)\b/i,
    toolPrefixes: ["knowledge_calculate", "knowledge_search"],
  },
  {
    name: "weather",
    keywords: /\b(clima|tiempo|lluv|llueve|temperatura|pron[oó]stico|weather|niev[ae]|sol|nublado|tormenta|paraguas|calor|fr[ií]o|grados|viento)\b/i,
    toolPrefixes: ["knowledge_weather"],
  },
  {
    name: "news",
    keywords: /\b(noticia|noticias|news|titular|headlines|actualidad|prensa|peri[oó]dico|qu[eé] (pasa|pas[oó])|[uú]ltima hora)\b/i,
    toolPrefixes: ["knowledge_news"],
  },
  {
    name: "currency",
    keywords: /\b(cambio|divisa|currency|EUR|USD|GBP|MXN|COP|d[oó]lar|euro|libra|peso|yen|convertir (dinero|moneda)|tipo de cambio|exchange)\b/i,
    toolPrefixes: ["knowledge_currency"],
  },
  {
    name: "food",
    keywords: /\b(calor[ií]as|nutrici[oó]n|nutricional|macros|prote[ií]na|carbohidrato|grasa|alimento|comida info|food facts|c[oó]digo de barras|barcode|nutri.?score)\b/i,
    toolPrefixes: ["knowledge_food"],
  },
  {
    name: "nutrition",
    keywords: /\b(dieta|plan (de comida|nutricional|alimenticio)|meal plan|comer|desayuno|almuerzo|cena|snack|agua|peso|IMC|nutrition_|hidrat|kcal)\b/i,
    toolPrefixes: ["nutrition_"],
  },
  {
    name: "wellness",
    keywords: /\b(bienestar|emocional|[aá]nimo|estr[eé]s|ansiedad|medita|dormir|sue[nñ]o|crisis|p[aá]nico|respira|journaling|gratitud|wellness_)\b/i,
    toolPrefixes: ["wellness_"],
  },
  {
    name: "gmail",
    keywords: /\b(email|correo|gmail|mail|inbox|enviar (correo|email)|bandeja|gmail_)\b/i,
    toolPrefixes: ["gmail_"],
  },
  {
    name: "calendar",
    keywords: /\b(calendario|calendar|evento|cita|agenda|meeting|reuni[oó]n|calendar_)\b/i,
    toolPrefixes: ["calendar_"],
  },
];

/**
 * Filter tools based on the last user message.
 * Returns a subset of tools relevant to the user's intent.
 * If no specific intent detected, returns ALL tools (safe fallback).
 */
export function filterToolsByIntent(
  lastMessage: string,
  allTools: OpenAI.ChatCompletionTool[],
): OpenAI.ChatCompletionTool[] {
  if (!lastMessage) return allTools;

  // Find matching categories
  const matchedPrefixes = new Set<string>();
  let hasMatch = false;

  for (const cat of CATEGORIES) {
    if (cat.keywords.test(lastMessage)) {
      cat.toolPrefixes.forEach(p => matchedPrefixes.add(p));
      hasMatch = true;
    }
  }

  // No specific intent detected → send all tools (safe fallback)
  if (!hasMatch) return allTools;

  // Base tools always included (core functionality)
  const BASE_TOOL_NAMES = new Set([
    "create_reminder", "list_reminders", "cancel_reminder",
    "track_expense", "get_expenses", "calculate",
    "generate_image", "web_search",
  ]);

  return allTools.filter(tool => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (tool as any).function?.name || "";

    // Always include base tools
    if (BASE_TOOL_NAMES.has(name)) return true;

    // Include tools matching detected categories
    for (const prefix of matchedPrefixes) {
      if (name.startsWith(prefix) || name === prefix) return true;
    }

    return false;
  });
}
