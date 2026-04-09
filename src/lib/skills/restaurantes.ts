/**
 * Restaurant Finder — finds best rated restaurants nearby
 * Primary: Google Places API (needs GOOGLE_MAPS_API_KEY without referer restrictions)
 * Fallback: Serper Places API (already works)
 * Applies Bayesian weighted rating for honest ranking
 */

interface Restaurant {
  name: string;
  rating: number;
  reviews: number;
  bayesianScore: number;
  address: string;
  link: string;
  priceLevel?: string;
}

/**
 * Bayesian Weighted Rating
 * A restaurant with 4.8★ and 300 reviews beats one with 5.0★ and 10 reviews
 */
function bayesianRating(rating: number, reviews: number, avgRating: number, minReviews: number = 30): number {
  return (reviews / (reviews + minReviews)) * rating + (minReviews / (reviews + minReviews)) * avgRating;
}

/** Search restaurants using Google Places API */
async function searchGooglePlaces(city: string, cuisine?: string): Promise<Restaurant[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  const query = cuisine
    ? `restaurante ${cuisine} en ${city}`
    : `mejores restaurantes en ${city}`;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}&language=es&region=es`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "OK") return [];

    return (data.results || [])
      .filter((r: Record<string, unknown>) => r.rating && r.user_ratings_total)
      .map((r: Record<string, unknown>) => {
        const lat = (r.geometry as Record<string, Record<string, number>>)?.location?.lat;
        const lng = (r.geometry as Record<string, Record<string, number>>)?.location?.lng;
        const mapsLink = lat && lng
          ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(r.name))}+${encodeURIComponent(city)}`;
        const priceLevels = ["", "€", "€€", "€€€", "€€€€"];
        return {
          name: String(r.name || ""),
          rating: Number(r.rating) || 0,
          reviews: Number(r.user_ratings_total) || 0,
          bayesianScore: 0,
          address: String(r.formatted_address || ""),
          link: mapsLink,
          priceLevel: priceLevels[Number(r.price_level) || 0] || "",
        };
      });
  } catch { return []; }
}

/** Fallback: Serper Places */
async function searchSerperPlaces(city: string, cuisine?: string): Promise<Restaurant[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const query = cuisine
    ? `restaurante ${cuisine} ${city}`
    : `mejores restaurantes ${city}`;

  try {
    const res = await fetch("https://google.serper.dev/places", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "es", hl: "es" }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.places || [])
      .filter((p: Record<string, unknown>) => p.rating)
      .map((p: Record<string, unknown>) => {
        const cid = p.cid ? `&cid=${p.cid}` : "";
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(p.title))}+${encodeURIComponent(city)}${cid}`;
        return {
          name: String(p.title || ""),
          rating: Number(p.rating) || 0,
          reviews: Number(p.reviews) || 0,
          bayesianScore: 0,
          address: String(p.address || ""),
          link: mapsLink,
          priceLevel: "",
        };
      });
  } catch { return []; }
}

/** Find restaurants — tries Google Places first, falls back to Serper */
export async function findRestaurants(city: string, cuisine?: string): Promise<string> {
  // Try Google Places first (has review counts for Bayesian)
  let restaurants = await searchGooglePlaces(city, cuisine);

  // Fallback to Serper Places
  if (restaurants.length === 0) {
    restaurants = await searchSerperPlaces(city, cuisine);
  }

  if (restaurants.length === 0) {
    return `No encontré restaurantes en ${city}. Intenta con otra ciudad o zona.`;
  }

  // Calculate Bayesian weighted rating
  const avgRating = restaurants.reduce((s, r) => s + r.rating, 0) / restaurants.length;

  for (const r of restaurants) {
    // If no review count (Serper fallback), use rating directly but penalize
    r.bayesianScore = r.reviews > 0
      ? bayesianRating(r.rating, r.reviews, avgRating)
      : r.rating * 0.8; // penalize unknown review count
  }

  // Sort by Bayesian score
  restaurants.sort((a, b) => b.bayesianScore - a.bayesianScore);

  const cuisineLabel = cuisine ? ` de ${cuisine}` : "";
  let response = `**🍽️ Mejores restaurantes${cuisineLabel} en ${city}**\n*(ranking por calidad real: puntuación × volumen de reseñas)*\n\n`;

  for (const [i, r] of restaurants.slice(0, 8).entries()) {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    response += `${medal} **${r.name}**\n`;
    response += `   ⭐ ${r.rating}`;
    if (r.reviews > 0) response += ` (${r.reviews.toLocaleString("es")} reseñas)`;
    if (r.priceLevel) response += ` — ${r.priceLevel}`;
    response += `\n`;
    if (r.address) response += `   📍 ${r.address}\n`;
    response += `   🗺️ [Ver en Google Maps](${r.link})\n\n`;
  }

  response += `*Ranking Bayesiano: un restaurante con 4.8★ y 300 reseñas puntúa más que uno con 5.0★ y 10 reseñas.*`;

  return response;
}
