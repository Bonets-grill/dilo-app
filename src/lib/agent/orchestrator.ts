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

const ORCHESTRATOR_PROMPT = `You are an orchestrator. Given the user's message, decide which specialist agents to spawn.

Available agents:
- trader_portfolio: my portfolio, positions, P&L, performance, risk analysis, trading rules, trading profile
- trader_signals: generate signal, check sweeps, trading memory, trading insights, kill zone status
- trader_orders: buy/sell orders, trade journal, trading calendar
- trader_market: analyze stock (AAPL, TSLA), scan opportunities, compare stocks, earnings calendar
- trader_emotions: emotional state, tilt, FOMO, revenge, weekly report, correlations
- forex: forex pairs (EUR/USD, GBP/JPY, XAU/USD), gold, forex analysis, IG Markets
- knowledge: wikipedia, calculations, weather, currency conversion, general knowledge questions
- entertainment: movies, TV shows, what to watch, recommendations, actors
- nutrition: diet plans, meal logging, calories, recipes, food tracking, weight, water
- wellness: emotions, stress, anxiety, mood, meditation, breathing, mental health
- communication: email, gmail, calendar, whatsapp messages, contacts, reminders
- finance: expenses, spending, budget, subscriptions, price comparison, gas stations, restaurants, shopping
- news: headlines, current events, noticias
- general: greetings, small talk, image generation, anything that doesn't fit above

Rules:
- Return a JSON array of agents needed. Each has "role" and "task".
- task = what specifically this agent should do (rewrite the user's request for this specialist)
- Most messages need only 1 agent. Use 2+ only if the message clearly spans multiple domains.
- "Hola" or casual chat = [{"role":"general","task":"respond to greeting"}]
- If unsure, use "general"
- CRITICAL: Look at conversation history! If user says "más", "otro", "sí", "continúa", "more" → use the SAME agent type as the previous exchange. Context matters!

Example: User says "¿Qué tiempo hace en Madrid y recomiéndame una película?"
Response: [{"role":"knowledge","task":"Get current weather in Madrid"},{"role":"entertainment","task":"Recommend a movie"}]

Example: User says "Gasté 45 en comida"
Response: [{"role":"finance","task":"Track expense: 45 in food"}]

Respond with ONLY the JSON array, nothing else.`;

export async function planAgents(userMessage: string, recentMessages?: { role: string; content: string }[]): Promise<AgentSpec[]> {
  try {
    // Include recent conversation context so orchestrator understands "más", "otro", "sí", etc.
    const contextMessages: OpenAI.ChatCompletionMessageParam[] = [];
    if (recentMessages && recentMessages.length > 0) {
      const last4 = recentMessages.slice(-4);
      for (const m of last4) {
        contextMessages.push({ role: m.role as "user" | "assistant", content: m.content.slice(0, 150) });
      }
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      temperature: 0,
      messages: [
        { role: "system", content: ORCHESTRATOR_PROMPT },
        ...contextMessages,
        { role: "user", content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content || "[]";
    // Clean markdown if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const agents = JSON.parse(cleaned) as AgentSpec[];
    return agents.length > 0 ? agents : [{ role: "general", task: userMessage }];
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
    nutrition: {
      systemPrompt: `${base}\nEres un especialista en nutrición. Manejas planes de comida, registro de alimentos, calorías, recetas, agua, peso. SIEMPRE usa las herramientas. NUNCA bajes de 1200 kcal (mujer) o 1500 kcal (hombre).`,
      getTools: () => filterTools(["nutrition_"]),
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
