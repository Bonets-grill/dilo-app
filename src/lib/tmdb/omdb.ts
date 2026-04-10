/**
 * OMDb API client — complements TMDB with IMDb/Rotten Tomatoes data
 * API key required — http://www.omdbapi.com
 */

export interface OMDbResult {
  title: string;
  year: string;
  rated: string;
  runtime: string;
  genre: string;
  director: string;
  actors: string;
  plot: string;
  imdbRating: string;
  imdbVotes: string;
  rottenTomatoes: string | null;
  metacritic: string | null;
  awards: string;
  poster: string | null;
  type: string;
}

/**
 * Search by title
 */
export async function searchOMDb(title: string): Promise<OMDbResult | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}&plot=short`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Response === "False") return null;

    const rt = data.Ratings?.find((r: { Source: string }) => r.Source === "Rotten Tomatoes");
    const mc = data.Ratings?.find((r: { Source: string }) => r.Source === "Metacritic");

    return {
      title: data.Title,
      year: data.Year,
      rated: data.Rated,
      runtime: data.Runtime,
      genre: data.Genre,
      director: data.Director,
      actors: data.Actors,
      plot: data.Plot,
      imdbRating: data.imdbRating,
      imdbVotes: data.imdbVotes,
      rottenTomatoes: rt?.Value || null,
      metacritic: mc?.Value || null,
      awards: data.Awards,
      poster: data.Poster !== "N/A" ? data.Poster : null,
      type: data.Type,
    };
  } catch {
    return null;
  }
}

/**
 * Search by IMDb ID
 */
export async function getByImdbId(imdbId: string): Promise<OMDbResult | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${apiKey}&plot=short`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Response === "False") return null;

    const rt = data.Ratings?.find((r: { Source: string }) => r.Source === "Rotten Tomatoes");
    const mc = data.Ratings?.find((r: { Source: string }) => r.Source === "Metacritic");

    return {
      title: data.Title,
      year: data.Year,
      rated: data.Rated,
      runtime: data.Runtime,
      genre: data.Genre,
      director: data.Director,
      actors: data.Actors,
      plot: data.Plot,
      imdbRating: data.imdbRating,
      imdbVotes: data.imdbVotes,
      rottenTomatoes: rt?.Value || null,
      metacritic: mc?.Value || null,
      awards: data.Awards,
      poster: data.Poster !== "N/A" ? data.Poster : null,
      type: data.Type,
    };
  } catch {
    return null;
  }
}

/**
 * Format OMDb data as enrichment text
 */
export function formatOMDbEnrichment(omdb: OMDbResult): string {
  let result = "";
  if (omdb.imdbRating && omdb.imdbRating !== "N/A") {
    result += `IMDb: ${omdb.imdbRating}/10`;
  }
  if (omdb.rottenTomatoes) {
    result += `${result ? " · " : ""}Rotten Tomatoes: ${omdb.rottenTomatoes}`;
  }
  if (omdb.metacritic) {
    result += `${result ? " · " : ""}Metacritic: ${omdb.metacritic}`;
  }
  if (result) result += "\n";
  if (omdb.director && omdb.director !== "N/A") result += `Director: ${omdb.director}\n`;
  if (omdb.actors && omdb.actors !== "N/A") result += `Reparto: ${omdb.actors}\n`;
  if (omdb.runtime && omdb.runtime !== "N/A") result += `Duración: ${omdb.runtime}\n`;
  if (omdb.awards && omdb.awards !== "N/A" && omdb.awards !== "N/A") result += `Premios: ${omdb.awards}\n`;
  return result;
}
