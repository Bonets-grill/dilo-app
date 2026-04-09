/**
 * Restaurant Finder — finds best rated restaurants nearby
 * Uses Serper (Google results) to get real restaurant data with ratings
 * Applies Bayesian weighted rating: restaurants with more reviews ranked higher
 */

interface Restaurant {
  name: string;
  rating: number;
  reviews: number;
  bayesianScore: number;
  snippet: string;
  link: string;
  address?: string;
}

/**
 * Bayesian Weighted Rating
 * Formula: (v/(v+m)) × R + (m/(v+m)) × C
 * Where:
 *   R = restaurant's average rating
 *   v = number of reviews for this restaurant
 *   m = minimum reviews threshold (we use 50)
 *   C = average rating across all results
 *
 * A restaurant with 4.8★ and 300 reviews beats one with 5.0★ and 10 reviews
 */
function bayesianRating(rating: number, reviews: number, avgRating: number, minReviews: number = 50): number {
  return (reviews / (reviews + minReviews)) * rating + (minReviews / (reviews + minReviews)) * avgRating;
}

/** Search for restaurants in a city using Serper */
export async function findRestaurants(
  city: string,
  cuisine?: string,
  maxResults: number = 8,
): Promise<string> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return "Búsqueda no disponible. Falta configuración.";

  const query = cuisine
    ? `mejores restaurantes ${cuisine} en ${city} valoraciones`
    : `mejores restaurantes en ${city} valoraciones reseñas`;

  try {
    // Use Serper Places endpoint for Google Maps data
    const res = await fetch("https://google.serper.dev/places", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "es", hl: "es" }),
    });

    if (!res.ok) {
      // Fallback to regular search
      return findRestaurantsViaSearch(city, cuisine, key, maxResults);
    }

    const data = await res.json();
    const places = data.places || [];

    if (places.length === 0) {
      return findRestaurantsViaSearch(city, cuisine, key, maxResults);
    }

    // Parse places data
    const restaurants: Restaurant[] = places
      .filter((p: Record<string, unknown>) => p.rating && p.reviews)
      .map((p: Record<string, unknown>) => ({
        name: String(p.title || ""),
        rating: Number(p.rating) || 0,
        reviews: Number(p.reviews) || 0,
        bayesianScore: 0,
        snippet: String(p.description || p.type || ""),
        link: String(p.link || p.website || ""),
        address: String(p.address || ""),
      }));

    if (restaurants.length === 0) {
      return findRestaurantsViaSearch(city, cuisine, key, maxResults);
    }

    return formatRestaurantResults(restaurants, city, cuisine, maxResults);
  } catch {
    return "Error buscando restaurantes. Inténtalo de nuevo.";
  }
}

/** Fallback: search regular Google results for restaurants */
async function findRestaurantsViaSearch(
  city: string,
  cuisine: string | undefined,
  key: string,
  maxResults: number,
): Promise<string> {
  const query = cuisine
    ? `mejores restaurantes ${cuisine} ${city} google maps reseñas`
    : `mejores restaurantes ${city} google maps reseñas`;

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "es", hl: "es", num: 10 }),
    });
    if (!res.ok) return "No se pudieron buscar restaurantes.";

    const data = await res.json();
    const organic = data.organic || [];

    // Extract restaurant info from snippets (often contain "4.5 (234 reseñas)")
    const restaurants: Restaurant[] = [];
    for (const r of organic) {
      const ratingMatch = String(r.snippet || "").match(/(\d[.,]\d)\s*(?:★|estrellas?|stars?)?\s*[\(·]\s*(\d[\d.,]*)\s*(?:reseñas?|reviews?|opiniones?)/i);
      if (ratingMatch) {
        restaurants.push({
          name: String(r.title || "").replace(/ - .*$/, "").replace(/ \|.*$/, ""),
          rating: parseFloat(ratingMatch[1].replace(",", ".")),
          reviews: parseInt(ratingMatch[2].replace(/[.,]/g, "")),
          bayesianScore: 0,
          snippet: String(r.snippet || "").slice(0, 150),
          link: String(r.link || ""),
        });
      }
    }

    if (restaurants.length === 0) {
      // Just return top search results
      let response = `**🍽️ Restaurantes en ${city}**\n\n`;
      for (const r of organic.slice(0, maxResults)) {
        response += `- [${r.title}](${r.link})\n  ${(r.snippet || "").slice(0, 100)}\n\n`;
      }
      return response;
    }

    return formatRestaurantResults(restaurants, city, cuisine, maxResults);
  } catch {
    return "Error buscando restaurantes.";
  }
}

/** Format and rank restaurant results with Bayesian scoring */
function formatRestaurantResults(
  restaurants: Restaurant[],
  city: string,
  cuisine: string | undefined,
  maxResults: number,
): string {
  // Calculate average rating for Bayesian formula
  const avgRating = restaurants.reduce((s, r) => s + r.rating, 0) / restaurants.length;

  // Apply Bayesian weighted rating
  for (const r of restaurants) {
    r.bayesianScore = bayesianRating(r.rating, r.reviews, avgRating);
  }

  // Sort by Bayesian score (best first)
  restaurants.sort((a, b) => b.bayesianScore - a.bayesianScore);

  const cuisineLabel = cuisine ? ` de ${cuisine}` : "";
  let response = `**🍽️ Mejores restaurantes${cuisineLabel} en ${city}**\n*(ordenados por calidad real: rating × volumen de reseñas)*\n\n`;

  for (const [i, r] of restaurants.slice(0, maxResults).entries()) {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const stars = "⭐".repeat(Math.round(r.rating));
    response += `${medal} **${r.name}**\n`;
    response += `   ${stars} ${r.rating} — ${r.reviews.toLocaleString("es")} reseñas`;
    response += ` (score: ${r.bayesianScore.toFixed(2)})\n`;
    if (r.address) response += `   📍 ${r.address}\n`;
    if (r.link) response += `   🔗 [Ver en Google Maps](${r.link})\n`;
    response += `\n`;
  }

  response += `\n*El ranking usa puntuación Bayesiana: un restaurante con 4.8★ y 300 reseñas puntúa más que uno con 5.0★ y 10 reseñas.*`;

  return response;
}
