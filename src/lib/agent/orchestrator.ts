/**
 * DILO Multi-Agent Orchestrator
 *
 * Flow:
 * 1. Orchestrator reads user message → decides which agents to spawn
 * 2. Each agent runs independently with its own prompt + tools (max 10)
 * 3. Orchestrator collects results
 * 4. Agents destroyed after task
 * 5. Orchestrator synthesizes final response
 *
 * Why: A single agent with 60+ tools fails. 8 agents with 5-10 tools each = reliable.
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface AgentSpec {
  role: string;
  task: string;
}

export interface AgentResult {
  role: string;
  result: string;
  toolsCalled: string[];
}

// ── STEP 1: Orchestrator decides which agents to spawn ──

// ── LEVEL 1: Domain Router (5 domains only) ──
const DOMAIN_ROUTER_PROMPT = `Classify the user's message into exactly ONE domain. Look at conversation history for context.

Domains:
- trading: stocks, portfolio, P&L, positions, signals, buy/sell, market analysis, forex, gold, EUR/USD, AAPL, TSLA, broker, trading emotions
- health: nutrition, diet, calories, food logging, meal plan, weight, water, stress, anxiety, mood, meditation, breathing, wellness, exercise
- knowledge: weather, Wikipedia, calculations, currency conversion, movies, TV shows, news, headlines, general knowledge questions
- finances: expenses, spending, budget, reminders, subscriptions, price comparison, shopping, gas stations, restaurants
- communication: email, gmail, calendar, whatsapp, send message, contacts, image generation, greetings, small talk

If user says "más", "otro", "sí", "continúa" → use SAME domain as previous message.
Respond with ONLY the domain name, nothing else.`;

// ── LEVEL 2: Sub-agent Router (per domain) ──
const SUB_ROUTERS: Record<string, string> = {
  trading: `Pick the best agent for this trading request:
- trader_portfolio: portfolio, positions, P&L, performance, risk, rules, profile
- trader_signals: generate signal, check sweeps, memory, insights, kill zone
- trader_orders: buy/sell orders, journal, calendar
- trader_market: analyze stock, scan opportunities, compare, earnings
- trader_emotions: emotional state, tilt, FOMO, revenge, weekly report
- forex: forex pairs, EUR/USD, GBP/JPY, XAU/USD, gold, IG Markets
Respond with ONLY the agent name.`,

  health: `Pick the best agent:
- nutri_tracker: log food/water/weight, daily progress
- nutri_planner: meal plans, recipes, shopping list, nutrition setup
- nutri_coach: motivation, habits, emotional eating, accountability
- wellness: stress, anxiety, mood, meditation, breathing, mental health
Respond with ONLY the agent name.`,

  knowledge: `Pick the best agent:
- knowledge: weather, Wikipedia, calculations, currency conversion
- entertainment: movies, TV shows, recommendations, actors
- news: headlines, current events, noticias
Respond with ONLY the agent name.`,

  finances: `Pick the best agent:
- finance: expenses, spending, budget, reminders, shopping, price comparison
Respond with ONLY: finance`,

  communication: `Pick the best agent:
- communication: email, gmail, calendar, whatsapp, contacts
- general: greetings, small talk, image generation, casual chat
Respond with ONLY the agent name.`,
};

export async function planAgents(userMessage: string, recentMessages?: { role: string; content: string }[]): Promise<AgentSpec[]> {
  try {
    // Build context from recent messages
    const contextMessages: OpenAI.ChatCompletionMessageParam[] = [];
    if (recentMessages && recentMessages.length > 0) {
      for (const m of recentMessages.slice(-4)) {
        contextMessages.push({ role: m.role as "user" | "assistant", content: m.content.slice(0, 150) });
      }
    }

    // ── LEVEL 1: Pick domain (5 options — fast, accurate) ──
    const domainRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 20,
      temperature: 0,
      messages: [
        { role: "system", content: DOMAIN_ROUTER_PROMPT },
        ...contextMessages,
        { role: "user", content: userMessage },
      ],
    });
    const domain = (domainRes.choices[0]?.message?.content || "communication").trim().toLowerCase();
    const validDomains = ["trading", "health", "knowledge", "finances", "communication"];
    const safeDomain = validDomains.includes(domain) ? domain : "communication";

    // ── LEVEL 2: Pick specific agent within domain ──
    const subRouterPrompt = SUB_ROUTERS[safeDomain];
    const agentRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 30,
      temperature: 0,
      messages: [
        { role: "system", content: subRouterPrompt },
        { role: "user", content: userMessage },
      ],
    });
    const agentRole = (agentRes.choices[0]?.message?.content || "general").trim().toLowerCase().replace(/[^a-z_]/g, "");

    return [{ role: agentRole, task: userMessage }];
  } catch {
    return [{ role: "general", task: userMessage }];
  }
}

// ── STEP 2: Agent definitions (prompts + tools per agent) ──

import type { ChatCompletionTool } from "openai/resources/chat/completions";

interface AgentDefinition {
  systemPrompt: string;
  getTools: () => ChatCompletionTool[];
}

export function getAgentDefinition(
  role: string,
  userName: string,
  lang: string,
  allTools: ChatCompletionTool[],
): AgentDefinition {
  const filterTools = (prefixes: string[], extras: string[] = []): ChatCompletionTool[] => {
    const extraSet = new Set(extras);
    return allTools.filter(t => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name = (t as any).function?.name || "";
      if (extraSet.has(name)) return true;
      return prefixes.some(p => name.startsWith(p));
    });
  };

  const base = `Responde en ${lang === "es" ? "español" : lang === "en" ? "English" : lang === "fr" ? "français" : lang === "it" ? "italiano" : lang === "de" ? "Deutsch" : "español"}.
${userName ? `El usuario se llama ${userName}.` : ""}
SIEMPRE usa las herramientas disponibles. NUNCA inventes datos. Si una herramienta no devuelve datos, dilo honestamente.`;

  const definitions: Record<string, AgentDefinition> = {
    trader_portfolio: {
      systemPrompt: `${base}\nEres un especialista en portfolio de trading. Solo manejas: ver portfolio, posiciones, rendimiento, análisis de riesgo, reglas de trading, perfil de trader. SIEMPRE usa las herramientas.`,
      getTools: () => filterTools([], ["trading_portfolio", "trading_performance", "trading_risk_analysis", "trading_rules_check", "trading_rules_set", "trading_get_profile", "trading_setup_profile"]),
    },
    trader_signals: {
      systemPrompt: `${base}\nEres un especialista en señales de trading. Solo manejas: generar señales, verificar sweeps de liquidez, consultar memoria de trading, insights, y estado de kill zone. SIEMPRE usa las herramientas.`,
      getTools: () => filterTools([], ["trading_generate_signal", "trading_check_sweeps", "trading_memory", "trading_insights", "trading_kill_zone_status"]),
    },
    trader_orders: {
      systemPrompt: `${base}\nEres un especialista en órdenes de trading. Solo manejas: colocar órdenes (preview primero, ejecutar después), sincronizar journal, calendario de trading. SIEMPRE muestra preview antes de ejecutar.`,
      getTools: () => filterTools([], ["trading_place_order", "trading_journal_sync", "trading_journal_annotate", "trading_calendar"]),
    },
    trader_market: {
      systemPrompt: `${base}\nEres un especialista en análisis de mercado. Solo manejas: analizar acciones individuales, escanear oportunidades, comparar acciones, calendario de earnings. SIEMPRE usa datos reales de Finnhub.`,
      getTools: () => filterTools([], ["market_analyze_stock", "market_scan_opportunities", "market_compare_stocks", "market_earnings_calendar"]),
    },
    trader_emotions: {
      systemPrompt: `${base}\nEres un especialista en psicología de trading. Solo manejas: estado emocional (tilt, FOMO, revenge), reporte semanal, correlaciones de trading, kill zone. Sé empático pero firme con las advertencias.`,
      getTools: () => filterTools([], ["trading_emotional_status", "trading_weekly_report", "trading_correlations", "trading_kill_zone_status"]),
    },
    forex: {
      systemPrompt: `${base}\nEres un especialista en forex y oro (IG Markets). Solo sabes de: EUR/USD, GBP/JPY, XAU/USD y otros pares. SIEMPRE usa las herramientas para datos reales.`,
      getTools: () => filterTools(["forex_"]),
    },
    knowledge: {
      systemPrompt: `${base}\nEres un especialista en conocimiento general. Respondes preguntas usando Wikipedia, Wolfram Alpha para cálculos, Open-Meteo para clima, y ExchangeRate para divisas. SIEMPRE usa las herramientas.`,
      getTools: () => filterTools(["knowledge_"]),
    },
    entertainment: {
      systemPrompt: `${base}\nEres un especialista en películas y series. Usas OMDb para buscar por título o género en INGLÉS. SIEMPRE usa entertainment_search. NUNCA inventes películas.\nPara variar resultados, usa términos específicos: "comedy 2024", "horror classic", "action thriller", "romantic comedy", "sci-fi adventure", "crime drama". NO repitas siempre el mismo término genérico.`,
      getTools: () => filterTools(["entertainment_"]),
    },
    nutri_tracker: {
      systemPrompt: `${base}
Eres un nutricionista especializado en REGISTRO rápido de comida. Tu trabajo es hacer el logging lo más fácil posible.

FLUJO PARA REGISTRAR COMIDA:
- El usuario dice "desayuné huevos con tostada" → USA nutrition_log inmediatamente
- Estima calorías y macros basándote en porciones estándar (USDA):
  - 1 huevo = 72 kcal, 6g proteína, 5g grasa, 0.4g carbs
  - 1 tostada = 80 kcal, 3g proteína, 1g grasa, 15g carbs
  - 100g arroz cocido = 130 kcal, 2.7g proteína, 0.3g grasa, 28g carbs
  - 100g pechuga pollo = 165 kcal, 31g proteína, 3.6g grasa, 0g carbs
  - 1 plátano = 105 kcal, 1.3g proteína, 0.4g grasa, 27g carbs
- NO preguntes porciones exactas — estima y registra. El usuario puede corregir después.
- Después de registrar, muestra resumen del día con nutrition_progress.
- Para agua: "bebí 2 vasos" → nutrition_water con 500ml
- Para peso: "peso 78" → nutrition_weight

REGLA: Máxima simplicidad. El usuario dice qué comió, tú estimas y registras. Cero fricción.`,
      getTools: () => filterTools([], ["nutrition_log", "nutrition_log_photo", "nutrition_progress", "nutrition_water", "nutrition_weight"]),
    },
    nutri_planner: {
      systemPrompt: `${base}
Eres un nutricionista especializado en PLANIFICACIÓN. Creas planes de comida personalizados, recetas saludables y listas de compra.

FLUJO DE SETUP (primera vez):
1. Pregunta SOLO: peso, altura, edad, objetivo (perder/mantener/ganar)
2. Calcula todo automáticamente con nutrition_setup
3. Genera un plan semanal con nutrition_plan
4. Ofrece lista de compra con nutrition_shopping

REGLAS:
- NUNCA bajes de 1200 kcal (mujer) o 1500 kcal (hombre)
- Si el usuario tiene diabetes, embarazo, trastorno alimentario → NO generes plan, deriva a profesional
- Recetas: prácticas, ingredientes comunes, max 30 min preparación
- Adapta a la dieta del usuario (keto, vegano, mediterránea, etc.)
- Si el usuario dice "tengo hambre" o "qué como" → sugiere snack o comida que encaje con sus macros restantes`,
      getTools: () => filterTools([], ["nutrition_setup", "nutrition_plan", "nutrition_recipe", "nutrition_shopping", "nutrition_adjust"]),
    },
    nutri_coach: {
      systemPrompt: `${base}
Eres un coach nutricional tipo Noom. NO registras comida ni creas planes — eso lo hacen otros agentes. Tú MOTIVAS, ANALIZAS PATRONES y DAS FEEDBACK.

TU ROL:
- Si el usuario dice "no puedo con la dieta" → empatía + estrategia concreta
- Si pregunta "¿cómo voy?" → usa nutrition_progress para analizar y dar feedback
- Si come emocional → identifica triggers y sugiere alternativas
- Si lleva racha → celebra y refuerza
- Si abandonó días → NO juzgues, pregunta qué pasó y reajusta expectativas

ESTILO:
- Amigo sabio, no instructor militar
- Celebra pequeños logros: "3 días seguidos registrando, genial"
- Nunca uses culpa: "no deberías haber comido eso" → PROHIBIDO
- En vez de eso: "ayer fue un día alto en calorías. ¿Fue social o emocional? Los dos están bien, solo quiero entenderte mejor"
- Máximo 3-4 líneas de respuesta
- Termina con UNA pregunta para profundizar`,
      getTools: () => filterTools([], ["nutrition_progress"]),
    },
    wellness: {
      systemPrompt: `${base}\nEres un especialista en bienestar emocional. Manejas check-ins de ánimo, respiración guiada, gratitud, detección de crisis. SIEMPRE usa las herramientas cuando el usuario expresa emociones. Sé empático y cálido.`,
      getTools: () => filterTools(["wellness_"]),
    },
    communication: {
      systemPrompt: `${base}\nEres un especialista en comunicación. Manejas Gmail, Google Calendar, WhatsApp. Para WhatsApp: preview primero (confirmed=false), enviar después. Para emails: firma con el nombre real del usuario.`,
      getTools: () => filterTools(["gmail_", "calendar_", "search_contacts", "read_whatsapp", "send_whatsapp"], ["search_contacts", "read_whatsapp", "send_whatsapp"]),
    },
    finance: {
      systemPrompt: `${base}\nEres un especialista en finanzas personales. Manejas gastos, recordatorios, suscripciones, comparación de precios, gasolineras, restaurantes. SIEMPRE usa las herramientas.`,
      getTools: () => filterTools([], ["track_expense", "get_expenses", "create_reminder", "list_reminders", "cancel_reminder", "web_search"]),
    },
    news: {
      systemPrompt: `${base}\nEres un especialista en noticias. Usa knowledge_news para titulares y búsqueda de noticias. SIEMPRE busca noticias reales, NUNCA inventes.`,
      getTools: () => filterTools(["knowledge_news"], ["knowledge_news", "web_search"]),
    },
    general: {
      systemPrompt: `${base}\nEres DILO, un asistente personal inteligente y amigo de verdad. Eres cálido, empático y genuino. Respuestas cortas y directas con calidez humana. Puedes generar imágenes y hacer cálculos.`,
      getTools: () => filterTools([], ["generate_image", "calculate", "web_search"]),
    },
  };

  return definitions[role] || definitions.general;
}

// ── STEP 3: Execute a single agent ──

export async function executeAgent(
  spec: AgentSpec,
  definition: AgentDefinition,
  conversationHistory: OpenAI.ChatCompletionMessageParam[],
  executeToolFn: (name: string, input: Record<string, unknown>, userId: string) => Promise<string | null>,
  userId: string,
): Promise<AgentResult> {
  const tools = definition.getTools();
  const toolsCalled: string[] = [];

  // Build messages: system prompt + last 3 conversation messages for context + the task
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: definition.systemPrompt },
    ...conversationHistory.slice(-4),
    { role: "user", content: spec.task },
  ];

  // Tool loop (max 3 iterations per agent)
  for (let i = 0; i < 3; i++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: false,
    });

    const msg = response.choices[0].message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg);

      for (const tc of msg.tool_calls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (tc as any).function;
        const toolName = fn.name;
        toolsCalled.push(toolName);
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(fn.arguments || "{}"); } catch { /* skip */ }

        let result: string;
        try {
          result = await executeToolFn(toolName, input, userId) || JSON.stringify({ error: "Tool not found" });
        } catch (err) {
          result = JSON.stringify({ error: (err as Error).message });
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
      continue;
    }

    // No tool calls — return the text response
    return {
      role: spec.role,
      result: msg.content || "",
      toolsCalled,
    };
  }

  // Max iterations reached
  const lastMsg = messages[messages.length - 1];
  return {
    role: spec.role,
    result: typeof lastMsg === "object" && "content" in lastMsg ? String(lastMsg.content || "") : "",
    toolsCalled,
  };
}

// ── STEP 5: Synthesize results ──

export async function synthesize(
  userMessage: string,
  results: AgentResult[],
  userName: string,
  lang: string,
): Promise<string> {
  // If only 1 agent, return its result directly (no synthesis needed)
  if (results.length === 1) {
    return results[0].result;
  }

  // Multiple agents — synthesize into one coherent response
  const agentOutputs = results.map(r => `[${r.role}]: ${r.result}`).join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 800,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `Eres DILO. Sintetiza las respuestas de varios agentes especializados en UNA respuesta coherente y natural para ${userName || "el usuario"}. Responde en ${lang === "es" ? "español" : lang}. No menciones que hay agentes separados — responde como si fueras uno solo.`,
      },
      {
        role: "user",
        content: `Pregunta del usuario: ${userMessage}\n\nRespuestas de los agentes:\n${agentOutputs}`,
      },
    ],
  });

  return response.choices[0]?.message?.content || results.map(r => r.result).join("\n\n");
}
