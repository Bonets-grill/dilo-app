/**
 * TMDB (The Movie Database) API client
 * Free API key required — https://www.themoviedb.org/settings/api
 * Rate limit: 40 requests/10 seconds
 */

const BASE_URL = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w500";

function getApiKey(): string | null {
  return process.env.TMDB_API_KEY || null;
}

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  genre_ids: number[];
}

interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  genre_ids: number[];
}

export interface MediaResult {
  title: string;
  type: "movie" | "tv";
  overview: string;
  releaseDate: string;
  rating: number;
  voteCount: number;
  posterUrl: string | null;
  genres: string[];
}

const MOVIE_GENRES: Record<number, string> = {
  28: "Acción", 12: "Aventura", 16: "Animación", 35: "Comedia",
  80: "Crimen", 99: "Documental", 18: "Drama", 10751: "Familia",
  14: "Fantasía", 36: "Historia", 27: "Terror", 10402: "Música",
  9648: "Misterio", 10749: "Romance", 878: "Ciencia ficción",
  10770: "Película de TV", 53: "Thriller", 10752: "Bélica", 37: "Western",
};

const TV_GENRES: Record<number, string> = {
  10759: "Acción y Aventura", 16: "Animación", 35: "Comedia", 80: "Crimen",
  99: "Documental", 18: "Drama", 10751: "Familia", 10762: "Infantil",
  9648: "Misterio", 10763: "Noticias", 10764: "Reality", 10765: "Sci-Fi y Fantasía",
  10766: "Telenovela", 10767: "Talk Show", 10768: "Guerra y Política", 37: "Western",
};

function mapMovie(m: TMDBMovie): MediaResult {
  return {
    title: m.title,
    type: "movie",
    overview: m.overview,
    releaseDate: m.release_date,
    rating: m.vote_average,
    voteCount: m.vote_count,
    posterUrl: m.poster_path ? `${IMG_BASE}${m.poster_path}` : null,
    genres: m.genre_ids.map(id => MOVIE_GENRES[id] || "Otro").filter(Boolean),
  };
}

function mapTV(t: TMDBTVShow): MediaResult {
  return {
    title: t.name,
    type: "tv",
    overview: t.overview,
    releaseDate: t.first_air_date,
    rating: t.vote_average,
    voteCount: t.vote_count,
    posterUrl: t.poster_path ? `${IMG_BASE}${t.poster_path}` : null,
    genres: t.genre_ids.map(id => TV_GENRES[id] || MOVIE_GENRES[id] || "Otro").filter(Boolean),
  };
}

/**
 * Search for movies and TV shows
 */
export async function searchMedia(query: string, lang: string = "es-ES"): Promise<MediaResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `${BASE_URL}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=${lang}&page=1&include_adult=false`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || [])
      .filter((r: { media_type: string }) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 5)
      .map((r: { media_type: string } & TMDBMovie & TMDBTVShow) =>
        r.media_type === "movie" ? mapMovie(r) : mapTV(r)
      );
  } catch {
    return [];
  }
}

/**
 * Get trending movies and TV shows (this week)
 */
export async function getTrending(type: "movie" | "tv" | "all" = "all", lang: string = "es-ES"): Promise<MediaResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `${BASE_URL}/trending/${type}/week?api_key=${apiKey}&language=${lang}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || [])
      .slice(0, 10)
      .map((r: { media_type?: string; title?: string } & TMDBMovie & TMDBTVShow) => {
        const mediaType = r.media_type || (r.title ? "movie" : "tv");
        return mediaType === "movie" ? mapMovie(r) : mapTV(r);
      });
  } catch {
    return [];
  }
}

/**
 * Get now playing movies in theaters
 */
export async function getNowPlaying(lang: string = "es-ES", region: string = "ES"): Promise<MediaResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `${BASE_URL}/movie/now_playing?api_key=${apiKey}&language=${lang}&region=${region}&page=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).slice(0, 10).map(mapMovie);
  } catch {
    return [];
  }
}

/**
 * Get top rated movies or TV shows
 */
export async function getTopRated(type: "movie" | "tv" = "movie", lang: string = "es-ES"): Promise<MediaResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `${BASE_URL}/${type}/top_rated?api_key=${apiKey}&language=${lang}&page=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).slice(0, 10).map(type === "movie" ? mapMovie : mapTV);
  } catch {
    return [];
  }
}

/**
 * Discover movies by genre
 */
export async function discoverByGenre(genreId: number, type: "movie" | "tv" = "movie", lang: string = "es-ES"): Promise<MediaResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `${BASE_URL}/discover/${type}?api_key=${apiKey}&language=${lang}&sort_by=vote_average.desc&vote_count.gte=100&with_genres=${genreId}&page=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).slice(0, 10).map(type === "movie" ? mapMovie : mapTV);
  } catch {
    return [];
  }
}

/**
 * Find genre ID by name (fuzzy match)
 */
export function findGenreId(name: string): { id: number; type: "movie" | "tv" } | null {
  const lower = name.toLowerCase();
  const allGenres = { ...MOVIE_GENRES, ...TV_GENRES };
  for (const [id, genre] of Object.entries(allGenres)) {
    if (genre.toLowerCase().includes(lower) || lower.includes(genre.toLowerCase())) {
      return { id: Number(id), type: Number(id) > 10758 ? "tv" : "movie" };
    }
  }
  return null;
}
