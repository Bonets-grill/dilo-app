/**
 * GNews API client — Free tier: 100 calls/day
 * Requires GNEWS_API_KEY env var
 */

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  image: string | null;
}

/**
 * Get top headlines
 */
export async function getHeadlines(lang: string = "es", country: string = "es", max: number = 10): Promise<NewsArticle[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const res = await fetch(
      `https://gnews.io/api/v4/top-headlines?lang=${lang}&country=${country}&max=${max}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return (data.articles || []).map((a: {
      title: string;
      description: string;
      url: string;
      source: { name: string };
      publishedAt: string;
      image: string | null;
    }) => ({
      title: a.title,
      description: a.description,
      url: a.url,
      source: a.source?.name || "",
      publishedAt: a.publishedAt,
      image: a.image,
    }));
  } catch {
    return [];
  }
}

/**
 * Search for news articles by query
 */
export async function searchNews(query: string, lang: string = "es", max: number = 10): Promise<NewsArticle[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const res = await fetch(
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=${lang}&max=${max}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return (data.articles || []).map((a: {
      title: string;
      description: string;
      url: string;
      source: { name: string };
      publishedAt: string;
      image: string | null;
    }) => ({
      title: a.title,
      description: a.description,
      url: a.url,
      source: a.source?.name || "",
      publishedAt: a.publishedAt,
      image: a.image,
    }));
  } catch {
    return [];
  }
}
