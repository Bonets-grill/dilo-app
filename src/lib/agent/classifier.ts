import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Intent Classifier — Step 1 of 2-step agent architecture
 *
 * Uses a cheap, fast LLM call to classify the user's message into a category.
 * Then only the tools for that category are sent to the main LLM in Step 2.
 *
 * Cost: ~$0.00003 per classification (GPT-4o-mini, ~100 tokens)
 * Latency: ~200ms
 *
 * This replaces regex-based filtering which was unreliable (e.g., "película"
 * matching P&L regex).
 */

export type IntentCategory =
  | "entertainment"
  | "trading"
  | "knowledge"
  | "nutrition"
  | "wellness"
  | "finance"
  | "communication"
  | "general";

const CLASSIFIER_PROMPT = `You are an intent classifier. Classify the user's message into exactly ONE category.

Categories:
- entertainment: movies, TV shows, series, what to watch, recommendations, actors, directors, cinema
- trading: stocks, portfolio, trading, forex, market analysis, signals, P&L, buy/sell orders, broker
- knowledge: wikipedia, calculations, weather, news, currency conversion, general knowledge questions, science, history
- nutrition: diet, meal plans, calories, food logging, recipes, nutritional info, water intake, weight
- wellness: emotions, mood, stress, anxiety, meditation, sleep, breathing, mental health, journaling
- finance: expenses, spending, budget, bills, savings, subscriptions, price comparison, gas stations, restaurants, shopping
- communication: email, gmail, calendar, whatsapp, send message, reminders, contacts
- general: greetings, small talk, image generation, anything that doesn't fit above

Respond with ONLY the category name, nothing else.`;

export async function classifyIntent(message: string): Promise<IntentCategory> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 20,
      temperature: 0,
      messages: [
        { role: "system", content: CLASSIFIER_PROMPT },
        { role: "user", content: message },
      ],
    });

    const result = (response.choices[0]?.message?.content || "general").trim().toLowerCase() as IntentCategory;

    const valid: IntentCategory[] = ["entertainment", "trading", "knowledge", "nutrition", "wellness", "finance", "communication", "general"];
    return valid.includes(result) ? result : "general";
  } catch {
    return "general";
  }
}

/**
 * Filter tools based on classified intent.
 * Returns only the tools relevant to the category + base tools.
 */
export function getToolsForCategory(
  category: IntentCategory,
  allTools: OpenAI.ChatCompletionTool[],
): OpenAI.ChatCompletionTool[] {
  const BASE_TOOLS = new Set([
    "create_reminder", "list_reminders", "cancel_reminder",
    "track_expense", "get_expenses", "calculate",
    "generate_image", "web_search",
    "search_contacts", "read_whatsapp", "send_whatsapp",
  ]);

  const CATEGORY_PREFIXES: Record<IntentCategory, string[]> = {
    entertainment: ["entertainment_"],
    trading: ["trading_", "market_", "forex_"],
    knowledge: ["knowledge_"],
    nutrition: ["nutrition_"],
    wellness: ["wellness_"],
    finance: ["track_expense", "get_expenses", "knowledge_currency"],
    communication: ["gmail_", "calendar_", "search_contacts", "read_whatsapp", "send_whatsapp"],
    general: [], // Only base tools
  };

  const prefixes = CATEGORY_PREFIXES[category] || [];

  // If general, return ALL tools (safe fallback)
  if (category === "general" && prefixes.length === 0) {
    return allTools;
  }

  return allTools.filter(tool => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (tool as any).function?.name || "";

    // Always include base tools
    if (BASE_TOOLS.has(name)) return true;

    // Include tools matching the category
    for (const prefix of prefixes) {
      if (name.startsWith(prefix) || name === prefix) return true;
    }

    return false;
  });
}
