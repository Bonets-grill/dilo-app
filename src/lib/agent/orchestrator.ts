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

// ── DETERMINISTIC PRE-ROUTER: Skip LLM for obvious domains ──
// Saves 2 LLM calls per request when keywords clearly match a domain+agent

interface PreRouteResult {
  domain: string;
  agent: string;
}

const PRE_ROUTES: Array<{ pattern: RegExp; domain: string; agent: string }> = [
  // FOREX — very specific patterns, no ambiguity
  { pattern: /\b(EUR\/USD|GBP\/JPY|USD\/JPY|EUR\/GBP|GBP\/USD|AUD\/USD|USD\/CHF|USD\/CAD|NZD\/USD|XAU\/USD|forex|IG Markets|par(?:es)?\s+de\s+divisa)/i, domain: "trading", agent: "forex" },
  // TRADING — ticker symbols and trading-specific terms
  { pattern: /\b(mi\s+portfolio|mis\s+posiciones|trading_|market_|place\s+order|compra\s+\d+\s+acciones|vende\s+\d+|señal\s+(?:de|para)\s+\w{1,5}|sweep|liquidez|SMC|kill\s+zone)\b/i, domain: "trading", agent: "" },
  { pattern: /\b(AAPL|NVDA|TSLA|AMZN|MSFT|META|GOOGL|SPY|QQQ|NFLX|AMD|INTC)\b/, domain: "trading", agent: "trader_market" },
  { pattern: /\b(mi\s+(?:win\s+rate|rendimiento|performance|P&L))\b/i, domain: "trading", agent: "trader_portfolio" },
  { pattern: /\b(FOMO|revenge\s+trading|tilt|estado\s+emocional\s+(?:de\s+)?trading)\b/i, domain: "trading", agent: "trader_emotions" },
  // NUTRITION — food logging, meal plans
  { pattern: /\b(desayun[eéo]|almor[cz]|cen[eéo]|com[ií]\s|nutrition_|macro|kcal|calor[ií]as\s+(?:de|del|hoy)|plan\s+(?:de\s+)?comida|dieta|(?:registr|log)\s+comida)\b/i, domain: "health", agent: "nutri_tracker" },
  { pattern: /\b(receta|lista\s+de\s+compra|meal\s+plan|plan\s+nutricional|nutrition_setup|nutrition_plan)\b/i, domain: "health", agent: "nutri_planner" },
  // WELLNESS — emotional state
  { pattern: /\b(me\s+siento\s+(?:mal|triste|ansios|estresad|agobiad)|ansiedad|medit|respira(?:ción|r)\s+guiada|wellness_|bienestar\s+emocional|gratitud|grounding)\b/i, domain: "health", agent: "wellness" },
  // ENTERTAINMENT
  { pattern: /\b(pel[ií]cula|series?\b|qu[eé]\s+ver\s+(?:hoy|esta)|cine|cartelera|netflix|hbo|disney|entertainment_)\b/i, domain: "knowledge", agent: "entertainment" },
  // WEATHER
  { pattern: /\b(clima|tiempo\s+(?:en|para)|lluev[ea]|temperatura|pron[oó]stico|weather|niev[ae]|paraguas)\b/i, domain: "knowledge", agent: "knowledge" },
  // NEWS
  { pattern: /\b(noticia|headlines|titular|[uú]ltima\s+hora|qu[eé]\s+pas[aoó]\s+(?:en|con|hoy))\b/i, domain: "knowledge", agent: "news" },
  // ── NEW MODULES (must match BEFORE generic gmail/email) ──
  // WRITING
  { pattern: /\b(escribe\s+(?:un\s+)?(?:email|correo|cold\s+email|follow\s+up)|write\s+(?:an?\s+)?email|carta\s+de\s+agradecimiento|thank\s+you\s+(?:note|letter)|cold\s+email|redacta\s+(?:un\s+)?(?:email|correo))\b/i, domain: "writing", agent: "email_writer" },
  { pattern: /\b(post\s+(?:de|para|en)\s+(?:linkedin|instagram|twitter|facebook)|tweet|caption|social\s+media\s+post)\b/i, domain: "writing", agent: "social_writer" },
  { pattern: /\b(copy\s+(?:para|for)|descripci[oó]n\s+de\s+producto|landing\s+page|ad\s+copy|tagline|press\s+release|nota\s+de\s+prensa)\b/i, domain: "writing", agent: "copywriter" },
  { pattern: /\b(escribe\s+como|rewrite|hazlo\s+m[aá]s\s+(?:formal|casual|profesional)|write\s+(?:like|in\s+(?:the\s+)?style))\b/i, domain: "writing", agent: "style_writer" },
  // CAREER
  { pattern: /\b(curr[ií]cul[ou]m|CV|resume|hazme\s+un\s+CV|build\s+(?:my\s+)?resume)\b/i, domain: "career", agent: "resume_builder" },
  { pattern: /\b(simula\s+(?:una\s+)?entrevista|interview\s+(?:practice|sim)|preguntas\s+de\s+entrevista)\b/i, domain: "career", agent: "interview_coach" },
  { pattern: /\b(negociar\s+salario|salary\s+negoti|cu[aá]nto\s+pedir|cuanto\s+cobrar\s+por)\b/i, domain: "career", agent: "salary_advisor" },
  { pattern: /\b(consejo(?:s)?\s+de\s+carrera|career\s+(?:advice|path)|errores?\s+a\s+evitar\s+en\s+(?:mi\s+)?carrera)\b/i, domain: "career", agent: "career_advisor" },
  // BUSINESS
  { pattern: /\b(modelo\s+de\s+negocio|business\s+model|c[oó]mo\s+monetizar|lean\s+canvas)\b/i, domain: "business", agent: "business_model" },
  { pattern: /\b(compet(?:idor|encia|itor)|competitor\s+analysis|an[aá]lisis\s+de\s+competencia)\b/i, domain: "business", agent: "competitor_analyst" },
  { pattern: /\b(estrategia\s+de\s+precios|pricing|cu[aá]nto\s+cobrar|how\s+(?:much\s+)?to\s+charge)\b/i, domain: "business", agent: "pricing_advisor" },
  { pattern: /\b(SEO|keywords?|meta\s+description|posicionamiento|long\s+tail)\b/i, domain: "business", agent: "seo_expert" },
  { pattern: /\b(estrategia\s+(?:de\s+)?redes\s+sociales|social\s+media\s+strat|content\s+calendar|qu[eé]\s+public[ao]r)\b/i, domain: "business", agent: "social_strategist" },
  { pattern: /\b(ideas?\s+para\s+ganar\s+dinero|side\s+hustle|c[oó]mo\s+ganar\s+con|monetizar\s+(?:mis\s+)?skills?|earn\s+(?:money|ideas))\b/i, domain: "business", agent: "earn_advisor" },
  // PRODUCTIVITY
  { pattern: /\b(plan(?:ea|ifica)\s+(?:mi\s+)?viaje|trip\s+to|viajo\s+a|itinerario|vacaciones\s+(?:a|en))\b/i, domain: "productivity", agent: "trip_planner" },
  { pattern: /\b(organiza\s+mi\s+(?:semana|d[ií]a)|schedule|mi\s+horario|plan\s+(?:del\s+)?d[ií]a|weekly\s+plan)\b/i, domain: "productivity", agent: "scheduler" },
  { pattern: /\b(ay[uú]dame?\s+a\s+decidir|pros\s+y?\s+contras|should\s+I|ventajas\s+y?\s+desventajas|tomar\s+(?:una\s+)?decisi[oó]n)\b/i, domain: "productivity", agent: "decision" },
  { pattern: /\b(ens[eé][ñn]ame|expl[ií]came|teach\s+me|c[oó]mo\s+funciona|what\s+is|qu[eé]\s+es\s+(?:un|una|el|la))\b/i, domain: "productivity", agent: "learner" },
  { pattern: /\b(MBTI|personalidad|personality|qu[eé]\s+tipo\s+de\s+persona|my\s+personality)\b/i, domain: "productivity", agent: "personality" },
  { pattern: /\b(m[uú]ltiples?\s+perspectivas?|different\s+opinions?|qu[eé]\s+opinar[ií]an?|viewpoints?)\b/i, domain: "productivity", agent: "decision" },
  // ── EXISTING (generic patterns last) ──
  // GMAIL — only direct inbox access
  { pattern: /\b(lee\s+(?:mi\s+)?(?:email|correo)|gmail|inbox|bandeja|gmail_|mis\s+correos|revisar?\s+(?:mi\s+)?correo)\b/i, domain: "communication", agent: "communication" },
  // CALENDAR
  { pattern: /\b(calendario|agenda|evento|cita|meeting|reuni[oó]n|calendar_)\b/i, domain: "communication", agent: "communication" },
  // WHATSAPP
  { pattern: /\b(whatsapp|manda\s+(?:un\s+)?mensaje|env[ií]a\s+(?:un\s+)?mensaje|lee\s+mis\s+mensajes)\b/i, domain: "communication", agent: "whatsapp" },
  // EXPENSES
  { pattern: /\b(gast[eéo]|mis\s+gastos|cu[aá]nto\s+gast|presupuesto|suscripcion|recordatorio)\b/i, domain: "finances", agent: "finance" },
];

function preRoute(message: string): PreRouteResult | null {
  const lower = message.toLowerCase();
  for (const route of PRE_ROUTES) {
    if (route.pattern.test(lower) || route.pattern.test(message)) {
      return { domain: route.domain, agent: route.agent };
    }
  }
  return null;
}

// ── LEVEL 1: Domain Router (5 domains only) — used when pre-router has no match ──
const DOMAIN_ROUTER_PROMPT = `Classify the user's message into exactly ONE domain.

Domains:
- trading: stocks, portfolio, P&L, positions, signals, buy/sell, market analysis, forex, gold, broker, trading emotions
- health: nutrition, diet, calories, food logging, meal plan, weight, water, stress, anxiety, mood, meditation, breathing, wellness
- knowledge: weather, Wikipedia, calculations, currency conversion, movies, TV shows, news, headlines, general knowledge
- finances: expenses, spending, budget, reminders, subscriptions, price comparison, shopping
- communication: email, gmail, calendar, whatsapp, send message, image generation, greetings, casual chat
- productivity: trip planning, travel, schedule, daily planner, decisions, pros cons, learn a topic, teach me, explain something, MBTI, personality, multiple perspectives
- writing: write an email, cold email, follow up, social media post, LinkedIn message, Instagram caption, marketing copy, product description, landing page, ad copy, rewrite in style
- career: resume, CV, job interview, salary negotiation, career advice, career pitfalls, hiring
- business: business model, competitors, pricing strategy, SEO, keywords, social media strategy, content calendar, how to make money, side hustle, monetize skills

CRITICAL disambiguation examples:
- "cómo va Cuba" → knowledge (it's news/geography, NOT a stock ticker)
- "qué pasa en el mundo" → knowledge (news)
- "qué tiempo hace" → knowledge (weather)
- "cuánto es 45+30" → knowledge (calculation)
- "me siento mal" → health (wellness)
- "gasté 20 en café" → finances
- "hola qué tal" → communication (greeting)
- "analiza AAPL" → trading (stock ticker)
- "mi portfolio" → trading

If user says "más", "otro", "sí", "continúa" → use SAME domain as previous message.
Respond with ONLY the domain name.`;

// ── LEVEL 2: Sub-agent Router (per domain) ──
const SUB_ROUTERS: Record<string, string> = {
  trading: `Pick the best agent. Examples after each agent:
- trader_portfolio: portfolio, positions, P&L, performance, risk, rules, profile. Ex: "mi portfolio", "mis posiciones", "mi rendimiento"
- trader_signals: generate signal, check sweeps, memory, insights. Ex: "señal para AAPL", "hay manipulación?"
- trader_orders: buy/sell orders, journal, calendar. Ex: "compra 10 AAPL", "mi calendario de trading"
- trader_market: analyze stock, scan opportunities, compare, earnings. Ex: "analiza Tesla", "qué compro?", "earnings esta semana"
- trader_emotions: emotional state, tilt, FOMO, revenge, weekly report. Ex: "cómo estoy emocionalmente", "reporte semanal"
- forex: forex pairs (EUR/USD, GBP/JPY), gold (XAU/USD), IG Markets. Ex: "analiza EUR/USD", "precio del oro"
IMPORTANT: Individual stock tickers (AAPL, TSLA) → trader_market, NOT forex.
Respond with ONLY the agent name.`,

  health: `Pick the best agent:
- nutri_tracker: log food/water/weight, daily progress. Ex: "desayuné huevos", "bebí agua", "peso 78"
- nutri_planner: meal plans, recipes, shopping list, nutrition setup. Ex: "plan de comida", "receta saludable"
- nutri_coach: motivation, habits, emotional eating. Ex: "no puedo con la dieta", "cómo voy?"
- wellness: stress, anxiety, mood, meditation, breathing, mental health. Ex: "me siento ansioso", "quiero meditar"
Respond with ONLY the agent name.`,

  knowledge: `Pick the best agent:
- knowledge: weather, Wikipedia, calculations, currency conversion, general questions. Ex: "qué tiempo hace", "quién fue Einstein", "convierte 100 USD a EUR"
- entertainment: movies, TV shows, recommendations, actors. Ex: "recomienda una película", "qué ver en Netflix"
- news: headlines, current events, what's happening. Ex: "noticias de hoy", "qué pasa en Ucrania"
Respond with ONLY the agent name.`,

  finances: `Respond with ONLY: finance`,

  communication: `Pick the best agent:
- whatsapp: send/read WhatsApp messages, search contacts. Ex: "manda mensaje a Juan", "lee mis mensajes"
- communication: email, gmail, calendar, events, agenda. Ex: "lee mi correo", "crea evento mañana"
- general: greetings, small talk, image generation, casual conversation. Ex: "hola", "genera una imagen", "cómo estás"
Respond with ONLY the agent name.`,

  productivity: `Pick the best agent:
- trip_planner: plan trips, itineraries, travel. Ex: "planea mi viaje a Lisboa", "trip to Paris 5 days"
- scheduler: daily/weekly schedule, organize time, plan my day. Ex: "organiza mi semana", "plan my day"
- decision: pros/cons, help decide, multiple perspectives. Ex: "ayúdame a decidir", "pros y contras de", "qué opinan"
- learner: learn topics, teach me, explain concepts. Ex: "enséñame sobre blockchain", "cómo funciona la bolsa"
- personality: MBTI, personality analysis. Ex: "mi personalidad", "qué tipo de persona soy"
Respond with ONLY the agent name.`,

  writing: `Pick the best agent:
- email_writer: write emails, cold emails, follow ups, thank you notes. Ex: "escribe un cold email", "follow up email"
- social_writer: social media posts, LinkedIn, Instagram, Twitter. Ex: "post de LinkedIn", "Instagram caption"
- copywriter: marketing copy, product descriptions, landing pages, ads, press releases. Ex: "copy para mi producto", "ad copy"
- style_writer: rewrite text in a specific style. Ex: "escribe como Steve Jobs", "hazlo más formal"
Respond with ONLY the agent name.`,

  career: `Pick the best agent:
- resume_builder: create/update resume or CV. Ex: "hazme un currículum", "actualiza mi CV"
- interview_coach: simulate interviews, practice questions. Ex: "simula una entrevista para PM"
- salary_advisor: salary negotiation, how much to ask. Ex: "cuánto pedir", "negotiate salary"
- career_advisor: career advice, pitfalls, path planning. Ex: "consejos de carrera", "errores a evitar"
Respond with ONLY the agent name.`,

  business: `Pick the best agent:
- business_model: create business model, lean canvas, monetization. Ex: "modelo de negocio para app", "cómo monetizar"
- competitor_analyst: competitor analysis, market research. Ex: "analiza competidores", "quién compite conmigo"
- pricing_advisor: pricing strategy, how much to charge. Ex: "cuánto cobrar", "estrategia de precios"
- seo_expert: SEO, keywords, meta descriptions, positioning. Ex: "SEO para mi web", "keywords para"
- social_strategist: social media strategy, content calendar. Ex: "estrategia de redes sociales", "qué publicar"
- earn_advisor: income ideas, side hustles, monetize skills. Ex: "ideas para ganar dinero", "side hustle con programación"
Respond with ONLY the agent name.`,
};

export async function planAgents(userMessage: string, recentMessages?: { role: string; content: string }[]): Promise<AgentSpec[]> {
  try {
    // ── STEP 0: Deterministic pre-router (no LLM needed for obvious intents) ──
    const preResult = preRoute(userMessage);

    if (preResult && preResult.agent) {
      // Both domain and agent are clear — skip both LLM calls
      return [{ role: preResult.agent, task: userMessage }];
    }

    // Build context from recent messages
    const contextMessages: OpenAI.ChatCompletionMessageParam[] = [];
    if (recentMessages && recentMessages.length > 0) {
      for (const m of recentMessages.slice(-4)) {
        contextMessages.push({ role: m.role as "user" | "assistant", content: m.content.slice(0, 150) });
      }
    }

    // ── LEVEL 1: Pick domain ──
    let safeDomain: string;

    if (preResult) {
      // Pre-router knows the domain but not the agent — skip Level 1 LLM
      safeDomain = preResult.domain;
    } else {
      // No keyword match — use LLM to classify domain
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
      const validDomains = ["trading", "health", "knowledge", "finances", "communication", "productivity", "writing", "career", "business"];
      safeDomain = validDomains.includes(domain) ? domain : "communication";
    }

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

    // Validate agent exists in definitions
    const validAgents = [
      "trader_portfolio", "trader_signals", "trader_orders", "trader_market",
      "trader_emotions", "forex", "knowledge", "entertainment", "news",
      "nutri_tracker", "nutri_planner", "nutri_coach", "wellness",
      "whatsapp", "communication", "finance", "general",
      "trip_planner", "scheduler", "decision", "learner", "personality",
      "email_writer", "social_writer", "copywriter", "style_writer",
      "resume_builder", "interview_coach", "salary_advisor", "career_advisor",
      "business_model", "competitor_analyst", "pricing_advisor", "seo_expert", "social_strategist", "earn_advisor",
    ];
    const safeAgent = validAgents.includes(agentRole) ? agentRole : "general";

    return [{ role: safeAgent, task: userMessage }];
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
    whatsapp: {
      systemPrompt: `${base}
Eres un especialista en WhatsApp. PUEDES enviar mensajes, leer mensajes, y buscar contactos.

FLUJO PARA ENVIAR:
1. Usa send_whatsapp con confirmed=false para PREVIEW
2. Muestra al usuario qué se va a enviar
3. Si confirma → send_whatsapp con confirmed=true

PROGRAMAR MENSAJES:
- Si el usuario dice "dentro de X minutos" → crea un recordatorio con create_reminder
- El texto del recordatorio debe incluir: "Enviar WhatsApp a [número]: [mensaje]"
- TAMBIÉN puedes enviar inmediatamente si el usuario lo pide

NUNCA digas que no puedes enviar WhatsApp. SÍ PUEDES. USA send_whatsapp.
Limpia números automáticamente (quita guiones, espacios). Añade código de país si falta.`,
      getTools: () => filterTools([], ["send_whatsapp", "read_whatsapp", "search_contacts", "create_reminder"]),
    },
    communication: {
      systemPrompt: `${base}\nEres un especialista en email y calendario. Manejas Gmail y Google Calendar. Para emails: firma con el nombre real del usuario.`,
      getTools: () => filterTools(["gmail_", "calendar_"]),
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

    // ── PRODUCTIVITY AGENTS ──
    trip_planner: {
      systemPrompt: `${base}\nEres un experto en viajes. SIEMPRE usa productivity_plan_trip para generar itinerarios detallados con costes, hoteles y tips. NUNCA planees de memoria.`,
      getTools: () => filterTools([], ["productivity_plan_trip"]),
    },
    scheduler: {
      systemPrompt: `${base}\nEres un experto en productividad. SIEMPRE usa productivity_schedule para crear horarios optimizados.\nCRÍTICO: SIEMPRE pasa el parámetro language con el idioma del usuario ("${lang}").`,
      getTools: () => filterTools([], ["productivity_schedule"]),
    },
    decision: {
      systemPrompt: `${base}\nEres un asesor estratégico. Para decisiones usa productivity_decide. Para múltiples perspectivas usa productivity_perspectives. SIEMPRE usa las herramientas.`,
      getTools: () => filterTools([], ["productivity_decide", "productivity_perspectives"]),
    },
    learner: {
      systemPrompt: `${base}\nEres un profesor experto. SIEMPRE usa productivity_learn para enseñar temas de forma estructurada.`,
      getTools: () => filterTools([], ["productivity_learn"]),
    },
    personality: {
      systemPrompt: `${base}\nEres un psicólogo especialista en personalidad. USA productivity_mbti para analizar el tipo de personalidad.`,
      getTools: () => filterTools([], ["productivity_mbti"]),
    },

    // ── WRITING AGENTS ──
    email_writer: {
      systemPrompt: `${base}\nEres un experto en comunicación escrita. SIEMPRE usa writing_email. NUNCA escribas emails de memoria.\nCRÍTICO: SIEMPRE pasa el parámetro sender_name con el nombre real del usuario ("${userName}").`,
      getTools: () => filterTools([], ["writing_email"]),
    },
    social_writer: {
      systemPrompt: `${base}\nEres un community manager experto. SIEMPRE usa writing_message para crear posts optimizados por plataforma.`,
      getTools: () => filterTools([], ["writing_message"]),
    },
    copywriter: {
      systemPrompt: `${base}\nEres un copywriter de clase mundial. SIEMPRE usa writing_copy con frameworks de marketing (AIDA, PAS, BAB).`,
      getTools: () => filterTools([], ["writing_copy"]),
    },
    style_writer: {
      systemPrompt: `${base}\nEres un experto en estilos de escritura. SIEMPRE usa writing_style_match para reescribir textos en el estilo solicitado.`,
      getTools: () => filterTools([], ["writing_style_match"]),
    },

    // ── CAREER AGENTS ──
    resume_builder: {
      systemPrompt: `${base}\nEres un consultor de RRHH experto en CVs. SIEMPRE usa career_build_resume con método STAR y keywords ATS. Usa el nombre real del usuario.`,
      getTools: () => filterTools([], ["career_build_resume"]),
    },
    interview_coach: {
      systemPrompt: `${base}\nEres un recruiter senior. SIEMPRE usa career_interview_sim para generar preguntas de entrevista realistas.`,
      getTools: () => filterTools([], ["career_interview_sim"]),
    },
    salary_advisor: {
      systemPrompt: `${base}\nEres un coach de negociación salarial. SIEMPRE usa career_salary_negotiate para dar rangos de mercado y scripts.`,
      getTools: () => filterTools([], ["career_salary_negotiate"]),
    },
    career_advisor: {
      systemPrompt: `${base}\nEres un estratega de carrera. SIEMPRE usa career_pitfalls para analizar riesgos y crear un plan de acción.`,
      getTools: () => filterTools([], ["career_pitfalls"]),
    },

    // ── BUSINESS AGENTS ──
    business_model: {
      systemPrompt: `${base}\nEres un consultor de startups. SIEMPRE usa business_model para generar Lean Canvas con cifras reales.`,
      getTools: () => filterTools([], ["business_model"]),
    },
    competitor_analyst: {
      systemPrompt: `${base}\nEres un analista de mercado. SIEMPRE usa business_competitor_analysis para identificar competidores y oportunidades.`,
      getTools: () => filterTools([], ["business_competitor_analysis"]),
    },
    pricing_advisor: {
      systemPrompt: `${base}\nEres un estratega de pricing. SIEMPRE usa business_pricing para crear estrategias de precios con tiers y márgenes.`,
      getTools: () => filterTools([], ["business_pricing"]),
    },
    seo_expert: {
      systemPrompt: `${base}\nEres un experto en SEO. SIEMPRE usa business_seo para generar keywords, meta descriptions y plan de contenido.`,
      getTools: () => filterTools([], ["business_seo"]),
    },
    social_strategist: {
      systemPrompt: `${base}\nEres un estratega de redes sociales. SIEMPRE usa business_social_strategy para crear calendarios de contenido.`,
      getTools: () => filterTools([], ["business_social_strategy"]),
    },
    earn_advisor: {
      systemPrompt: `${base}\nEres un asesor de ingresos. SIEMPRE usa business_earn_ideas para generar ideas basadas en habilidades y presupuesto.`,
      getTools: () => filterTools([], ["business_earn_ideas"]),
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

  // Build messages: agent's own system prompt + last 8 user/assistant messages for context
  // IMPORTANT: Filter out system messages — agents have their OWN focused prompt.
  // Leaking the massive route.ts system prompt (110+ lines, all tool instructions)
  // confuses agents and causes wrong tool selection.
  const contextMessages = conversationHistory
    .filter(m => m.role !== "system")
    .slice(-8);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: definition.systemPrompt },
    ...contextMessages,
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
