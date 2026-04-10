/**
 * Wikipedia API client — Free, no API key needed
 * Uses the MediaWiki REST API for search and article summaries
 */

interface WikiSearchResult {
  title: string;
  description: string;
  extract: string;
  thumbnail?: { url: string };
}

interface WikiArticle {
  title: string;
  extract: string;
  description: string;
  url: string;
  thumbnail?: string;
}

/**
 * Search Wikipedia for articles matching a query
 */
export async function searchWikipedia(query: string, lang: string = "es", limit: number = 5): Promise<WikiSearchResult[]> {
  try {
    const res = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const results = data.query?.search || [];

    return results.map((r: { title: string; snippet: string }) => ({
      title: r.title,
      description: "",
      extract: r.snippet.replace(/<[^>]+>/g, ""), // Strip HTML tags
    }));
  } catch {
    return [];
  }
}

/**
 * Get a summary of a specific Wikipedia article
 */
export async function getArticleSummary(title: string, lang: string = "es"): Promise<WikiArticle | null> {
  try {
    const res = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return null;

    const data = await res.json();
    return {
      title: data.title,
      extract: data.extract || "",
      description: data.description || "",
      url: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbnail: data.thumbnail?.source,
    };
  } catch {
    return null;
  }
}
