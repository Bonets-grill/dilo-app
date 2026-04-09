import OpenAI from "openai";

export const WEB_SEARCH_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current, real-time information. Use for news, prices, flights, weather, products, events, or anything that needs up-to-date data.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
  price?: number;
  currency?: string;
}

interface SearchResponse {
  results: SearchResult[];
  answerBox?: string;
}

/** Single Serper call — returns structured results with real links */
export async function searchSerper(query: string): Promise<SearchResponse> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { results: [] };

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 6, gl: "es", hl: "es" }),
    });
    if (!res.ok) return { results: [] };
    const data = await res.json();

    const results: SearchResult[] = (data.organic || []).map((r: Record<string, unknown>) => ({
      title: (r.title as string) || "",
      snippet: (r.snippet as string) || "",
      link: (r.link as string) || "",
      price: r.price as number | undefined,
      currency: r.currency as string | undefined,
    }));

    return {
      results,
      answerBox: data.answerBox?.answer || data.answerBox?.snippet || undefined,
    };
  } catch {
    return { results: [] };
  }
}

/** Tool executor for LLM tool calling (fallback path) */
export async function executeWebSearch(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (toolName !== "web_search") return JSON.stringify({ error: `Unknown tool: ${toolName}` });

  const query = input.query as string;
  if (!query) return JSON.stringify({ error: "Query is required" });

  // Try Serper first
  const serper = await searchSerper(query);
  if (serper.results.length > 0) {
    const text = serper.results.map(r => `${r.title}: ${r.snippet} (${r.link})`).join("\n\n");
    return JSON.stringify({ results: text, query, source: "google" });
  }

  // Fallback: Tavily
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
        const parts: string[] = [];
        if (data.answer) parts.push(data.answer);
        if (data.results) {
          for (const r of data.results.slice(0, 5)) {
            parts.push(`${r.title}: ${r.content?.slice(0, 200)} (${r.url})`);
          }
        }
        if (parts.length > 0) return JSON.stringify({ results: parts.join("\n\n"), query, source: "tavily" });
      }
    } catch { /* fallback */ }
  }

  // Fallback: Groq
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: `Answer concisely (5-6 sentences) with facts and numbers:\n\n${query}` }],
          max_tokens: 500, temperature: 0.3,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const answer = data.choices?.[0]?.message?.content;
        if (answer) return JSON.stringify({ answer, query, source: "ai_knowledge" });
      }
    } catch { /* fallback */ }
  }

  return JSON.stringify({ answer: `No encontré resultados para "${query}".`, query, source: "none" });
}
