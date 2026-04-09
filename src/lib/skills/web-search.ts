import OpenAI from "openai";

export const WEB_SEARCH_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current, real-time information. Use for news, prices, flights, weather, products, events, or anything that needs up-to-date data. ALWAYS use this instead of guessing.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (be specific for better results)" },
        },
        required: ["query"],
      },
    },
  },
];

export async function executeWebSearch(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (toolName !== "web_search") return JSON.stringify({ error: `Unknown tool: ${toolName}` });

  const query = input.query as string;
  if (!query) return JSON.stringify({ error: "Query is required" });

  // Strategy 1: Serper.dev — Real Google Search results
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 5, gl: "es", hl: "es" }),
      });
      if (res.ok) {
        const data = await res.json();
        const results: string[] = [];

        // Knowledge Graph (instant answer)
        if (data.knowledgeGraph) {
          const kg = data.knowledgeGraph;
          results.push(`${kg.title || ""}: ${kg.description || ""}`);
          if (kg.attributes) {
            for (const [k, v] of Object.entries(kg.attributes)) {
              results.push(`${k}: ${v}`);
            }
          }
        }

        // Answer Box
        if (data.answerBox) {
          results.push(data.answerBox.answer || data.answerBox.snippet || "");
        }

        // Organic results
        if (data.organic) {
          for (const r of data.organic.slice(0, 5)) {
            results.push(`${r.title}: ${r.snippet} (${r.link})`);
          }
        }

        if (results.length > 0) {
          return JSON.stringify({ results: results.join("\n\n"), query, source: "google" });
        }
      }
    } catch { /* fallback */ }
  }

  // Strategy 2: Tavily — AI-optimized search (1,000/month free)
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 5, include_answer: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const results: string[] = [];
        if (data.answer) results.push(data.answer);
        if (data.results) {
          for (const r of data.results.slice(0, 5)) {
            results.push(`${r.title}: ${r.content?.slice(0, 200)} (${r.url})`);
          }
        }
        if (results.length > 0) {
          return JSON.stringify({ results: results.join("\n\n"), query, source: "tavily" });
        }
      }
    } catch { /* fallback */ }
  }

  // Strategy 3: Groq AI knowledge (fast, free)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{
            role: "user",
            content: `Answer this search query with accurate, up-to-date information. Be comprehensive but concise (max 5-6 sentences). Include key facts, dates, and numbers when relevant.\n\nQuery: ${query}`,
          }],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const answer = data.choices?.[0]?.message?.content;
        if (answer) return JSON.stringify({ answer, query, source: "ai_knowledge" });
      }
    } catch { /* fallback */ }
  }

  // Strategy 3: DuckDuckGo Instant Answers (free, no key)
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.Abstract) {
        return JSON.stringify({ answer: data.Abstract, query, source: "duckduckgo", url: data.AbstractURL });
      }
    }
  } catch { /* silent */ }

  return JSON.stringify({ answer: `No encontré resultados para "${query}". Intenta reformular tu búsqueda.`, query, source: "none" });
}

/** Returns raw links from Serper for appending to responses */
export async function executeWebSearchRaw(query: string): Promise<Array<{ title: string; url: string }>> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 5, gl: "es", hl: "es" }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).slice(0, 5).map((r: { title: string; link: string }) => ({
      title: r.title,
      url: r.link,
    }));
  } catch { return []; }
}
