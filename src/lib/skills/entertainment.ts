import OpenAI from "openai";

export const ENTERTAINMENT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "entertainment_search",
      description: "Search for movies or TV shows by name. Use when user asks about a specific movie/show, wants recommendations, or asks 'what to watch'. Returns IMDb ratings, Rotten Tomatoes, cast, plot.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Movie or TV show name, or genre keyword (e.g. 'Inception', 'best comedy 2024', 'terror')" },
          type: { type: "string", enum: ["movie", "series"], description: "Filter by movie or series. Omit for both." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "entertainment_detail",
      description: "Get detailed info about a specific movie or TV show. Use when user asks for details, cast, ratings, awards of a specific title.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Exact movie or TV show title" },
        },
        required: ["title"],
      },
    },
  },
];

export async function executeEntertainmentTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    if (toolName === "entertainment_search") {
      const { searchOMDbMultiple } = await import("@/lib/tmdb/omdb");
      const query = input.query as string;
      const type = input.type as "movie" | "series" | undefined;
      const results = await searchOMDbMultiple(query, type);

      if (results.length === 0) {
        return `No encontré resultados para "${query}". Prueba con otro título o palabra clave.`;
      }

      let response = `**Resultados: "${query}"**\n\n`;
      for (const r of results) {
        const typeLabel = r.type === "movie" ? "Película" : r.type === "series" ? "Serie" : r.type;
        response += `**${r.title}** (${r.year}) — ${typeLabel}\n`;

        if (r.imdbRating && r.imdbRating !== "N/A") {
          response += `IMDb: ${r.imdbRating}/10`;
          if (r.rottenTomatoes) response += ` · RT: ${r.rottenTomatoes}`;
          if (r.metacritic) response += ` · MC: ${r.metacritic}`;
          response += "\n";
        }

        if (r.genre && r.genre !== "N/A") response += `Género: ${r.genre}\n`;
        if (r.director && r.director !== "N/A") response += `Director: ${r.director}\n`;
        if (r.actors && r.actors !== "N/A") response += `Reparto: ${r.actors}\n`;
        if (r.plot && r.plot !== "N/A") response += `${r.plot.slice(0, 200)}${r.plot.length > 200 ? "..." : ""}\n`;
        if (r.awards && r.awards !== "N/A" && r.awards !== "N/A.") response += `Premios: ${r.awards}\n`;
        response += "\n";
      }

      return response;
    }

    if (toolName === "entertainment_detail") {
      const { searchOMDb, formatOMDbEnrichment } = await import("@/lib/tmdb/omdb");
      const title = input.title as string;
      const result = await searchOMDb(title);

      if (!result) {
        return `No encontré información sobre "${title}".`;
      }

      let response = `**${result.title}** (${result.year})\n\n`;
      if (result.plot && result.plot !== "N/A") response += `${result.plot}\n\n`;
      response += formatOMDbEnrichment(result);
      if (result.rated && result.rated !== "N/A") response += `Clasificación: ${result.rated}\n`;

      return response;
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    console.error("[Entertainment Tool] Error:", err);
    return JSON.stringify({ error: "Error accessing entertainment data" });
  }
}
