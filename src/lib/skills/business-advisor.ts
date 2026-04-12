import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const BUSINESS_ADVISOR_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "business_model",
      description: "Create or improve a business model. Use when user says 'business model for...', 'modelo de negocio', 'how to monetize...', 'improve my business'",
      parameters: {
        type: "object",
        properties: {
          idea: { type: "string", description: "Business idea or current business description" },
          stage: { type: "string", enum: ["idea", "early", "growing", "established"], description: "Business stage" },
          industry: { type: "string", description: "Industry or sector" },
          budget: { type: "string", description: "Available budget" },
        },
        required: ["idea"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "business_competitor_analysis",
      description: "Analyze competitors in a market. Use when user says 'analyze competitors', 'who are my competitors', 'análisis de competencia', 'competitor research'",
      parameters: {
        type: "object",
        properties: {
          business: { type: "string", description: "Your business or product" },
          market: { type: "string", description: "Market or geography" },
          known_competitors: { type: "string", description: "Competitors you already know (comma-separated)" },
        },
        required: ["business"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "business_pricing",
      description: "Create pricing strategy for a product or service. Use when user says 'how to price...', 'pricing strategy', 'cuánto cobrar', 'estrategia de precios'",
      parameters: {
        type: "object",
        properties: {
          product: { type: "string", description: "Product or service to price" },
          costs: { type: "string", description: "Known costs (production, delivery, etc.)" },
          target_market: { type: "string", description: "Target market description" },
          competitor_prices: { type: "string", description: "Known competitor prices" },
        },
        required: ["product"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "business_seo",
      description: "Generate SEO strategy: keywords, meta descriptions, content plan. Use when user says 'SEO for my website', 'keywords for...', 'mejorar posicionamiento', 'meta descriptions'",
      parameters: {
        type: "object",
        properties: {
          website_or_business: { type: "string", description: "Website URL or business description" },
          target_keywords: { type: "string", description: "Keywords you want to rank for" },
          language: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "Target language" },
          location: { type: "string", description: "Target geography" },
        },
        required: ["website_or_business"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "business_social_strategy",
      description: "Create a social media content strategy. Use when user says 'social media plan', 'content calendar', 'estrategia de redes sociales', 'what to post'",
      parameters: {
        type: "object",
        properties: {
          business: { type: "string", description: "Business or brand" },
          platforms: { type: "string", description: "Comma-separated: instagram, linkedin, twitter, tiktok, youtube" },
          goals: { type: "string", description: "Goals: awareness, leads, sales, community" },
          posting_frequency: { type: "string", description: "How often: daily, 3x/week, weekly" },
        },
        required: ["business", "platforms"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "business_earn_ideas",
      description: "Generate income ideas based on skills and budget. Use when user says 'how to make money with...', 'ideas para ganar dinero', 'side hustle ideas', 'monetize my skills'",
      parameters: {
        type: "object",
        properties: {
          skills: { type: "string", description: "User's skills" },
          budget: { type: "string", description: "Available budget to invest" },
          time_available: { type: "string", description: "Hours per week available" },
          location: { type: "string", description: "City/country" },
        },
        required: ["skills"],
      },
    },
  },
];

export async function executeBusinessAdvisorTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    if (toolName === "business_model") {
      const { idea, stage = "idea", industry = "", budget = "" } = input as {
        idea: string; stage?: string; industry?: string; budget?: string;
      };

      const prompt = `Create a business model for: "${idea}"
Stage: ${stage}
Industry: ${industry || "to be determined"}
Budget: ${budget || "not specified"}

Return JSON with Lean Canvas format:
{
  "problem": ["problem 1", "problem 2", "problem 3"],
  "solution": ["solution 1", "solution 2", "solution 3"],
  "unique_value_proposition": "single clear message",
  "unfair_advantage": "what can't be copied",
  "customer_segments": ["segment 1", "segment 2"],
  "channels": ["channel 1", "channel 2"],
  "revenue_streams": [{"stream": "name", "model": "subscription/one-time/freemium", "estimated_price": "€XX"}],
  "cost_structure": [{"cost": "name", "amount": "€XX/mo", "type": "fixed/variable"}],
  "key_metrics": ["metric 1", "metric 2"],
  "next_steps": [
    {"step": "action", "timeline": "when", "cost": "€XX"},
    {"step": "action", "timeline": "when", "cost": "€XX"}
  ],
  "risks": ["risk 1", "risk 2"],
  "estimated_monthly_revenue": "€XX after 6 months",
  "break_even": "estimated months to break even"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        temperature: 0.6,
        messages: [
          { role: "system", content: "You are a startup advisor and business strategist. Return valid JSON only. Be specific with numbers." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const model = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, business_model: JSON.parse(model) });
    }

    if (toolName === "business_competitor_analysis") {
      const { business, market = "global", known_competitors = "" } = input as {
        business: string; market?: string; known_competitors?: string;
      };

      const prompt = `Competitor analysis for: "${business}" in market: ${market}
Known competitors: ${known_competitors || "identify them"}

Return JSON:
{
  "your_position": "market positioning summary",
  "competitors": [
    {
      "name": "competitor",
      "strengths": ["s1", "s2"],
      "weaknesses": ["w1", "w2"],
      "pricing": "their pricing",
      "market_share": "estimated",
      "threat_level": "low/medium/high"
    }
  ],
  "opportunities": ["gap in market 1", "gap 2"],
  "your_advantages": ["advantage 1", "advantage 2"],
  "strategy_recommendation": "how to compete (3 sentences)",
  "blue_ocean_ideas": ["untapped opportunity 1", "opportunity 2"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1200,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are a market analyst. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, analysis: JSON.parse(result) });
    }

    if (toolName === "business_pricing") {
      const { product, costs = "", target_market = "", competitor_prices = "" } = input as {
        product: string; costs?: string; target_market?: string; competitor_prices?: string;
      };

      const prompt = `Pricing strategy for: "${product}"
Costs: ${costs || "estimate based on industry"}
Target market: ${target_market || "general"}
Competitor prices: ${competitor_prices || "estimate based on industry"}
CRITICAL: This is pricing for a SOFTWARE/SERVICE, not the development cost. Use MONTHLY subscription prices (€9-€299/month range for SaaS).
NEVER confuse development costs with customer-facing subscription prices.
The current year is 2026.

Return JSON:
{
  "recommended_price": "€XX",
  "pricing_model": "subscription/one-time/freemium/tiered",
  "tiers": [
    {"name": "Free/Basic", "price": "€0", "features": ["f1", "f2"]},
    {"name": "Pro", "price": "€XX", "features": ["f1", "f2", "f3"]},
    {"name": "Enterprise", "price": "€XX", "features": ["all + f4"]}
  ],
  "psychology_tricks": ["pricing psychology tip 1", "tip 2"],
  "margin_analysis": {"cost": "€XX", "price": "€XX", "margin": "XX%"},
  "competitor_comparison": "how you compare",
  "launch_strategy": "introductory pricing recommendation"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are a pricing strategist. Return valid JSON only. Use EUR." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, pricing: JSON.parse(result) });
    }

    if (toolName === "business_seo") {
      const { website_or_business, target_keywords = "", language = "es", location = "" } = input as {
        website_or_business: string; target_keywords?: string; language?: string; location?: string;
      };

      const prompt = `SEO strategy for: "${website_or_business}"
Target keywords: ${target_keywords || "suggest based on the actual business/website purpose — analyze what it does from the URL/name"}
Language: ${language}
Location: ${location || "global"}
CRITICAL: The current year is 2026. All content suggestions must reference 2026, NOT 2024 or 2025.
Analyze what the business actually does from its name/URL before suggesting keywords. Do NOT use generic keywords like "web design" — match the actual business.

Return JSON:
{
  "primary_keywords": ["kw1", "kw2", "kw3"],
  "long_tail_keywords": ["long tail 1", "long tail 2", "long tail 3", "long tail 4", "long tail 5"],
  "meta_title": "optimized title tag (under 60 chars)",
  "meta_description": "optimized meta description (under 160 chars)",
  "content_plan": [
    {"topic": "blog post topic", "target_keyword": "kw", "search_intent": "informational/transactional", "priority": "high/medium"}
  ],
  "technical_tips": ["technical SEO tip 1", "tip 2"],
  "quick_wins": ["easy improvement 1", "easy improvement 2"],
  "monthly_content_calendar": {"week1": "topic", "week2": "topic", "week3": "topic", "week4": "topic"}
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1200,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are an SEO expert. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, seo: JSON.parse(result) });
    }

    if (toolName === "business_social_strategy") {
      const { business, platforms, goals = "awareness", posting_frequency = "3x/week" } = input as {
        business: string; platforms: string; goals?: string; posting_frequency?: string;
      };

      const prompt = `Social media strategy for: "${business}"
Platforms: ${platforms}
Goals: ${goals}
Posting frequency: ${posting_frequency}

Return JSON:
{
  "strategy_summary": "2-sentence strategy",
  "content_pillars": ["pillar 1", "pillar 2", "pillar 3"],
  "weekly_calendar": [
    {"day": "Monday", "platform": "instagram", "content_type": "carousel", "topic": "topic idea", "best_time": "10:00"}
  ],
  "content_ideas": [
    {"idea": "post idea", "format": "reel/carousel/story/post", "platform": "instagram", "hook": "first line to grab attention"}
  ],
  "hashtag_strategy": {"primary": ["#tag1"], "secondary": ["#tag2"], "niche": ["#tag3"]},
  "growth_tactics": ["tactic 1", "tactic 2"],
  "metrics_to_track": ["metric 1", "metric 2"],
  "tools_recommended": ["tool 1", "tool 2"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are a social media strategist. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, strategy: JSON.parse(result) });
    }

    if (toolName === "business_earn_ideas") {
      const { skills, budget = "€0", time_available = "10 hours/week", location = "" } = input as {
        skills: string; budget?: string; time_available?: string; location?: string;
      };

      const prompt = `Income ideas for someone with:
Skills: ${skills}
Budget: ${budget}
Time: ${time_available}
Location: ${location || "remote-friendly"}

Return JSON:
{
  "ideas": [
    {
      "idea": "business idea",
      "monthly_potential": "€XXX-€XXXX",
      "startup_cost": "€XX",
      "time_to_first_income": "X weeks/months",
      "difficulty": "easy/medium/hard",
      "steps_to_start": ["step 1", "step 2", "step 3"],
      "tools_needed": ["tool 1", "tool 2"],
      "scalability": "low/medium/high"
    }
  ],
  "best_pick": "which idea and why (2 sentences)",
  "passive_income_options": ["option 1", "option 2"],
  "skills_to_develop": ["skill that would unlock more opportunities 1", "skill 2"]
}

Provide 5-7 ideas, ordered by potential.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are an entrepreneurship advisor. Return valid JSON only. Be realistic with earnings." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, ...JSON.parse(result) });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    return JSON.stringify({ error: `Business advisor error: ${(err as Error).message}` });
  }
}
