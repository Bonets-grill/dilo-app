import OpenAI from "openai";

export const WEB_SEARCH_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information about any topic. Use when user asks about news, facts, prices, weather, or anything you don't know.",
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

export async function executeWebSearch(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (toolName !== "web_search") return JSON.stringify({ error: `Unknown tool: ${toolName}` });

  const query = input.query as string;
  if (!query) return JSON.stringify({ error: "Query is required" });

  // Strategy 1: Groq AI knowledge (fast, free tier available)
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

  // Strategy 2: DuckDuckGo Instant Answers (free, no key needed)
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
