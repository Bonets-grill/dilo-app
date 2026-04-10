import OpenAI from "openai";

export const ENTERTAINMENT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "entertainment_search",
      description: "Search for movies or TV shows by name. Use when user asks 'have you seen X', 'info about movie X', 'what is X about', or searches for a specific title.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Movie or TV show name to search for" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "entertainment_trending",
      description: "Get trending movies and TV shows this week. Use when user asks 'what to watch', 'popular movies', 'trending shows', 'recommend something', 'qué ver'.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["movie", "tv", "all"], description: "Filter by movies, tv shows, or all. Default: all" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "entertainment_now_playing",
      description: "Get movies currently in theaters / cartelera. Use when user asks 'cartelera', 'what is in cinemas', 'movies in theaters', 'qué hay en el cine'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "entertainment_top_rated",
      description: "Get top rated movies or TV shows of all time. Use when user asks 'best movies ever', 'mejores series', 'top rated', 'highest rated'.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["movie", "tv"], description: "Movies or TV shows. Default: movie" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "entertainment_by_genre",
      description: "Discover movies or TV shows by genre. Use when user asks 'recommend a comedy', 'best thrillers', 'quiero ver terror', 'películas de acción'.",
      parameters: {
        type: "object",
        properties: {
          genre: { type: "string", description: "Genre name: Acción, Comedia, Drama, Terror, Thriller, Romance, Ciencia ficción, Animación, Documental, Aventura, Crimen, Misterio, Fantasía" },
          type: { type: "string", enum: ["movie", "tv"], description: "Movies or TV shows. Default: movie" },
        },
        required: ["genre"],
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
      const { searchMedia } = await import("@/lib/tmdb/client");
      const query = input.query as string;
      const results = await searchMedia(query);

      if (results.length === 0) {
        return `No encontré resultados para "${query}".`;
      }

      return formatMediaResults(results, `Resultados: "${query}"`);
    }

    if (toolName === "entertainment_trending") {
      const { getTrending } = await import("@/lib/tmdb/client");
      const type = (input.type as "movie" | "tv" | "all") || "all";
      const results = await getTrending(type);

      if (results.length === 0) return "No pude obtener tendencias ahora.";

      const label = type === "movie" ? "Películas" : type === "tv" ? "Series" : "Películas y series";
      return formatMediaResults(results, `${label} en tendencia esta semana`);
    }

    if (toolName === "entertainment_now_playing") {
      const { getNowPlaying } = await import("@/lib/tmdb/client");
      const results = await getNowPlaying();

      if (results.length === 0) return "No pude obtener la cartelera ahora.";

      return formatMediaResults(results, "Cartelera — En cines ahora");
    }

    if (toolName === "entertainment_top_rated") {
      const { getTopRated } = await import("@/lib/tmdb/client");
      const type = (input.type as "movie" | "tv") || "movie";
      const results = await getTopRated(type);

      if (results.length === 0) return "No pude obtener el ranking.";

      const label = type === "movie" ? "Mejores películas" : "Mejores series";
      return formatMediaResults(results, `${label} de todos los tiempos`);
    }

    if (toolName === "entertainment_by_genre") {
      const { discoverByGenre, findGenreId } = await import("@/lib/tmdb/client");
      const genre = input.genre as string;
      const type = (input.type as "movie" | "tv") || "movie";

      const genreMatch = findGenreId(genre);
      if (!genreMatch) {
        return `No reconozco el género "${genre}". Prueba con: Acción, Comedia, Drama, Terror, Thriller, Romance, Ciencia ficción, Animación, Documental.`;
      }

      const results = await discoverByGenre(genreMatch.id, type);
      if (results.length === 0) return `No encontré resultados de ${genre}.`;

      const label = type === "movie" ? "Películas" : "Series";
      return formatMediaResults(results, `${label} de ${genre}`);
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    console.error("[Entertainment Tool] Error:", err);
    return JSON.stringify({ error: "Error accessing entertainment data" });
  }
}

function formatMediaResults(results: { title: string; type: string; overview: string; releaseDate: string; rating: number; voteCount: number; genres: string[] }[], title: string): string {
  let response = `**${title}**\n\n`;

  for (const r of results) {
    const typeLabel = r.type === "movie" ? "Película" : "Serie";
    const year = r.releaseDate?.slice(0, 4) || "?";
    const stars = r.rating >= 8 ? "***" : r.rating >= 7 ? "**" : r.rating >= 6 ? "*" : "";
    response += `**${r.title}** (${year}) — ${typeLabel} ${stars}\n`;
    response += `${r.rating}/10 (${r.voteCount} votos) · ${r.genres.join(", ")}\n`;
    if (r.overview) {
      response += `${r.overview.slice(0, 150)}${r.overview.length > 150 ? "..." : ""}\n`;
    }
    response += `\n`;
  }

  return response;
}
